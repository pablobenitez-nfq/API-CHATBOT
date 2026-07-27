// region: Imports y configuración
import React, { useState, useRef, useEffect } from "react";
import { TOOL_DEFINITION, executeTool } from "../features/toolUse.js";
import { buildWebSearchTool } from "../features/webSearch.js";
import { buildThinkingParam } from "../features/thinking.js";
import { guardAttachment, toContentBlock } from "../features/documents.js";
import { connectMcp, listMcpTools, callMcpTool, disconnectMcp } from "../features/mcp.js";
import { ToolStep, ThinkingBlock, CitationList } from "./MessageBlocks.jsx";
import TracePanel from "./TracePanel.jsx";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-5";
// endregion

// region: Composición del body del request (Fase 2: tool use)
// Helper de fusión de tools[]/thinking{} en el body de /v1/messages. Con
// todos los toggles de Fase 2 apagados sigue siendo no-op: se llama sin
// `tools` ni `thinking` y el body resultante es idéntico al de Fase 1.
// Cuando `toolUse` (u otro toggle de Fase 2) está activo, sendMessage le
// pasa `tools` acá — sendMessage no necesita reescribirse de nuevo.
function buildRequestBody({ messages, codeOnly, tools = [], thinking = null, maxTokens = 1024 }) {
  // Los mensajes en estado de React pueden traer propiedades extra de solo
  // UI (p.ej. `toolSteps`, `thinking`, agregadas para renderizar ToolStep/
  // ThinkingBlock). Nos quedamos únicamente con `role`/`content` acá para
  // que nunca terminen viajando en el body del request.
  const cleanMessages = messages.map(({ role, content }) => ({ role, content }));

  // Modo "solo código": se prellena el turno del assistant con la apertura
  // de un bloque de código y se corta la generación en el cierre ```. Este
  // modo es mutuamente excluyente con `thinking` en la UI (ver Chatbot()):
  // la API exige que, con thinking habilitado, el turno del assistant
  // empiece con un bloque thinking — un prefill "```" lo viola con un 400.
  const requestMessages = codeOnly
    ? [...cleanMessages, { role: "assistant", content: "```" }]
    : cleanMessages;

  const body = {
    model: MODEL,
    // `maxTokens` sube por encima de `budget_tokens` cuando thinking está
    // activo (ver sendMessage) — la API exige max_tokens > budget_tokens.
    max_tokens: maxTokens,
    messages: requestMessages,
  };

  if (codeOnly) {
    body.stop_sequences = ["```"];
  }

  if (tools.length > 0) {
    body.tools = tools;
  }

  if (thinking) {
    body.thinking = thinking;
  }

  return body;
}
// endregion

// region: Función que llama a la API (con loop de tool use)
// Con `toolUse` apagado (`tools` vacío) el loop de abajo se comporta
// exactamente igual que Fase 1: un solo round-trip, porque la API nunca
// puede devolver stop_reason "tool_use" si no le ofrecimos ninguna tool.
// Con `toolUse` activo, cada vez que la respuesta pide una tool
// (`stop_reason === "tool_use"`) la ejecutamos localmente vía executeTool,
// devolvemos el resultado como tool_result, y reenviamos el request
// completo (historial + turno assistant con el tool_use + turno user con
// el tool_result) hasta que stop_reason deje de ser "tool_use".
// `onTrace(event)` es opcional: si se pasa, se llama en cada paso real del
// intercambio con la API (request enviado, response recibida, tool cliente
// ejecutada localmente, o paso de web search server-side) para que la UI
// pueda mostrar en vivo qué está pasando — ver TracePanel.jsx. Sin
// `onTrace`, el comportamiento es idéntico al de antes.
//
// `flags` agrupa los toggles de Fase 2/3/4 activos: `{ toolUse, webSearch,
// webSearchDomain, thinking, mcp, mcpClient }`. toolUse y webSearch pueden
// combinarse libremente — ambas tools, si están activas, van en el mismo
// array `tools`. `thinking` es mutuamente excluyente con `codeOnly` en la UI
// (ver Chatbot()), así que acá no hace falta volver a validarlo. `mcp`/
// `mcpClient` (Fase 3) siguen el mismo mecanismo: con `mcp` activo y un
// cliente ya conectado (ver el `useEffect` en Chatbot()), las tools reales
// del servidor MCP se fusionan en el mismo array.
async function sendMessage(messages, codeOnly, flags, onTrace) {
  const url = "https://api.anthropic.com/v1/messages";
  const { toolUse, webSearch, webSearchDomain, thinking, mcp, mcpClient } = flags;

  const tools = [];
  if (toolUse) tools.push(TOOL_DEFINITION);
  if (webSearch) tools.push(buildWebSearchTool(webSearchDomain));

  // MCP (Fase 3): a diferencia de toolUse/webSearch (definiciones estáticas),
  // las tools MCP se descubren en runtime contra el servidor real —
  // `listMcpTools` ya las devuelve convertidas al shape {name, description,
  // input_schema} que espera este mismo array (ver features/mcp.js). Se
  // listan UNA sola vez por invocación de sendMessage, no en cada vuelta del
  // loop de abajo. `mcpToolNames` guarda los nombres descubiertos para que
  // el loop de tool_use sepa, por bloque, si debe resolverlo con
  // `callMcpTool` (real) o con `executeTool` (local, Fase 2).
  let mcpToolNames = new Set();
  if (mcp && mcpClient) {
    const mcpTools = await listMcpTools(mcpClient);
    tools.push(...mcpTools);
    mcpToolNames = new Set(mcpTools.map((tool) => tool.name));
  }

  const thinkingParam = thinking ? buildThinkingParam() : null;
  // La API exige max_tokens > budget_tokens cuando thinking está habilitado
  // — dejamos un margen fijo de 1024 tokens para la respuesta final además
  // del budget de razonamiento.
  const maxTokens = thinkingParam ? thinkingParam.budget_tokens + 1024 : 1024;

  let requestMessages = messages;
  const toolSteps = [];
  // Último bloque de thinking visto en la conversación: con `thinking`
  // activo puede aparecer en cada respuesta intermedia del loop de tool
  // use, no solo en la final, así que nos quedamos con el más reciente.
  let lastThinking = null;

  while (true) {
    const body = buildRequestBody({
      messages: requestMessages,
      codeOnly,
      tools,
      thinking: thinkingParam,
      maxTokens,
    });
    onTrace?.({ type: "request", body });

    const options = {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    };

    const response = await fetch(url, options);
    const result = await response.json();
    onTrace?.({ type: "response", result });

    if (!response.ok) {
      throw new Error(result.error?.message || "Request to the Anthropic API failed");
    }

    // Web search es una tool SERVER-SIDE: Anthropic la ejecuta y devuelve el
    // resultado ya resuelto, interleaved en este mismo `result.content` como
    // bloques `server_tool_use` (la query que Claude buscó) y
    // `web_search_tool_result` (los resultados). No hay tool_result que
    // nosotros debamos construir para esta tool — solo la reportamos al
    // trace para que se vea en el panel.
    for (const block of result.content ?? []) {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        onTrace?.({ type: "web_search", query: block.input?.query });
      }
      if (block.type === "web_search_tool_result") {
        onTrace?.({ type: "web_search", results: block.content });
      }
    }

    // Extended thinking (Fase 4): con `thinking` habilitado, la API antepone
    // un bloque `type === "thinking"` (razonamiento interno del modelo) al
    // resto del content, antes del bloque de texto final. Igual que con
    // `text` más abajo, no asumimos una posición fija — buscamos el bloque
    // por tipo.
    const thinkingBlock = (result.content ?? []).find((block) => block.type === "thinking");
    if (thinkingBlock) {
      lastThinking = thinkingBlock.thinking;
      onTrace?.({ type: "thinking", thinking: thinkingBlock.thinking });
    }

    if (result.stop_reason !== "tool_use") {
      // El texto de la respuesta NO siempre está en content[0]: con web
      // search activo, la API antepone bloques server_tool_use/
      // web_search_tool_result antes del texto, y con citations puede haber
      // varios bloques de texto intercalados. Concatenamos todos los
      // bloques "text" en orden en vez de asumir que hay uno solo al
      // principio — evita el mismo tipo de crash (acceder .text de un
      // bloque que no lo tiene) que el bug original de Fase 1.
      const textBlocks = (result.content ?? []).filter((block) => block.type === "text");
      const text = textBlocks.map((block) => block.text).join("");
      // Citations (Fase 5): con un documento adjunto con citations:{enabled:
      // true}, cada bloque de texto puede traer su propio array `.citations`
      // (uno por fragmento citado). Las juntamos todas en orden — el mismo
      // patrón filter+flatMap que usamos para el texto, evita asumir una
      // posición fija.
      const citations = textBlocks.flatMap((block) => block.citations ?? []);
      // Reconstruimos el bloque de código completo (prefill + respuesta)
      // para que el renderizado de mensajes lo detecte y lo muestre como
      // código.
      return {
        text: codeOnly ? "```" + text + "```" : text,
        toolSteps,
        thinking: lastThinking,
        citations,
      };
    }

    // La API pidió usar una o más tools CLIENTE (no web_search — esa ya se
    // resolvió arriba sin pasar por acá): las ejecutamos, guardamos cada
    // paso para poder renderizarlo con ToolStep, y armamos el turno de
    // tool_result que se manda de vuelta. Cada bloque se resuelve contra
    // `mcpToolNames` (Fase 3) primero: si matchea, es una tool real del
    // servidor MCP y se ejecuta con `callMcpTool` (async, contra el
    // servidor); si no, cae a `executeTool` local (Fase 2), sin cambios.
    const toolResultBlocks = [];
    for (const block of result.content) {
      if (block.type !== "tool_use") continue;

      let toolResult;
      if (mcpToolNames.has(block.name)) {
        const mcpResult = await callMcpTool(mcpClient, block.name, block.input);
        // `callMcpTool` devuelve el resultado crudo `{content, isError, ...}`
        // del SDK — nunca asumimos `content[0].text` a ciegas (mismo patrón
        // que el filtro de bloques "text" usado más arriba para el texto de
        // la respuesta). Si `isError` es true igual mandamos el contenido
        // como tool_result: no lanzamos, dejamos que el modelo vea el error.
        const mcpTextBlocks = (mcpResult.content ?? []).filter((part) => part.type === "text");
        toolResult = mcpTextBlocks.map((part) => part.text).join("");
      } else {
        toolResult = executeTool(block.name, block.input);
      }

      toolSteps.push({ name: block.name, input: block.input, result: toolResult });
      onTrace?.({ type: "tool_execution", name: block.name, input: block.input, result: toolResult });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: toolResult,
      });
    }

    requestMessages = [
      ...requestMessages,
      { role: "assistant", content: result.content },
      { role: "user", content: toolResultBlocks },
    ];
  }
}
// endregion

// region: Normalización de content (preparado para Fase 2)
// En Fase 1, `content` siempre es un string plano. En fases futuras, las
// features de src/features/ (tool use, documentos, etc.) van a poder armar
// `content` como un array de bloques estructurados (text/thinking/tool_use/
// tool_result/document) en su lugar. Este helper es el único punto de
// entrada para esa decisión: hoy no hay ninguna feature que produzca un
// array, así que se limita a devolver el string tal cual.
function normalizeContent(content) {
  if (typeof content === "string") {
    return content;
  }
  return content;
}
// endregion

// region: Renderizado de mensajes con bloques de código
// Con un adjunto (Fase 5), `content` puede ser un array multi-bloque
// [{type:"text"}, image|document] en vez del string plano de Fase 1 (ver
// normalizeContent). El regex de bloques de código de abajo espera un
// string, así que los arrays se resuelven aparte: se muestra el texto de la
// pregunta tal cual (sigue pasando por el detector de bloques ``` code) y un
// indicador simple del adjunto, sin decodificar el base64 en pantalla.
function renderMessageContent(rawContent) {
  const content = normalizeContent(rawContent);

  if (Array.isArray(content)) {
    return content.map((block, i) => {
      if (block.type === "text") {
        return <React.Fragment key={i}>{renderMessageContent(block.text)}</React.Fragment>;
      }
      if (block.type === "image") {
        return (
          <div key={i} style={attachmentIndicatorStyle}>
            📎 Imagen adjunta
          </div>
        );
      }
      if (block.type === "document") {
        return (
          <div key={i} style={attachmentIndicatorStyle}>
            📎 Documento adjunto: {block.title}
          </div>
        );
      }
      return null;
    });
  }

  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", value: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.map((part, i) =>
    part.type === "code" ? (
      <MessageCodeBlock key={i} code={part.value.trim()} />
    ) : (
      <span key={i} style={{ whiteSpace: "pre-wrap" }}>
        {part.value}
      </span>
    )
  );
}

// Bloque de código dentro de un mensaje, con su propio botón "Copiar"
// flotante arriba a la derecha del bloque.
function MessageCodeBlock({ code }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={handleCopy} style={copyCodeButtonStyle}>
        {copied ? "¡Copiado!" : "Copiar"}
      </button>
      <pre style={codeBlockStyle}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const codeBlockStyle = {
  display: "block",
  backgroundColor: "#1e1e1e",
  color: "#eaeaea",
  padding: "10px",
  paddingTop: "28px",
  borderRadius: "6px",
  overflowX: "auto",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: "13px",
  margin: "6px 0",
  textAlign: "left",
};

const copyCodeButtonStyle = {
  position: "absolute",
  top: "10px",
  right: "6px",
  padding: "2px 8px",
  fontSize: "11px",
  borderRadius: "4px",
  border: "1px solid #555",
  backgroundColor: "#333",
  color: "#eaeaea",
  cursor: "pointer",
  zIndex: 1,
};

const attachmentIndicatorStyle = {
  fontStyle: "italic",
  opacity: 0.85,
  fontSize: "13px",
};

const removeAttachmentButtonStyle = {
  padding: "2px 8px",
  fontSize: "12px",
  borderRadius: "4px",
  border: "1px solid #ccc",
  backgroundColor: "#f0f0f0",
  cursor: "pointer",
};
// endregion

// region: Formato de fuentes citadas (Fase 5, extendido a web search + cited_text)
// Cada objeto de `block.citations` (ver sendMessage) puede venir de dos
// orígenes distintos, con shapes distintos:
// - Documentos (PDF con citations habilitadas): `document_title`,
//   `start_page_number`/`end_page_number`, sin url.
// - Web search: trae `url` (la página real citada) y `title`, sin páginas.
// En ambos casos, la API también devuelve `cited_text`: el fragmento EXACTO
// de la fuente que respalda la afirmación — no solo de dónde salió, sino
// qué parte puntual se usó. Es el dato más útil para entender cómo funciona
// la feature de citations, así que lo mostramos siempre que venga.
// Devolvemos `{ text, url, citedText }` — CitationList renderiza `text`
// como link clickeable cuando hay `url` (o texto plano si no, caso PDF), y
// `citedText` como cita textual debajo. Si en el futuro aparece un tercer
// tipo de cita con campos distintos, se degrada mostrando solo el título en
// vez de romper.
function formatCitationSource(citation) {
  const title = citation.document_title || citation.title || "Fuente";
  const citedText = citation.cited_text || null;

  if (citation.url) {
    return { text: title, url: citation.url, citedText };
  }

  if (citation.start_page_number != null) {
    const endPage = citation.end_page_number ?? citation.start_page_number;
    return {
      text: `${title} (pág. ${citation.start_page_number}-${endPage})`,
      url: null,
      citedText,
    };
  }

  return { text: title, url: null, citedText };
}
// endregion

// region: Componente completo
export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [codeOnly, setCodeOnly] = useState(false);
  const [toolUse, setToolUse] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [webSearchDomain, setWebSearchDomain] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [trace, setTrace] = useState([]);
  const [mcp, setMcp] = useState(false);
  const [mcpError, setMcpError] = useState(null);
  const mcpClientRef = useRef(null);

  // Fase 3: conecta/desconecta el cliente MCP real cuando se togglea `mcp`.
  // La instancia de `Client` vive en `mcpClientRef` (no en estado de React:
  // no es serializable ni necesita disparar un re-render por sí misma —
  // sendMessage la lee vía flags.mcpClient, ver handleSend). `cancelled`
  // cubre el caso en que el toggle se apague antes de que `connectMcp()`
  // termine: si eso pasa, la conexión que llega tarde se cierra en vez de
  // quedar guardada en la ref. El cleanup del efecto (deps [mcp]) corre al
  // desactivar el toggle o al desmontar el componente, y siempre desconecta.
  useEffect(() => {
    if (!mcp) {
      return undefined;
    }

    let cancelled = false;

    connectMcp()
      .then((client) => {
        if (cancelled) {
          disconnectMcp(client);
          return;
        }
        mcpClientRef.current = client;
        setMcpError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setMcpError(err.message || "No se pudo conectar al servidor MCP.");
        }
      });

    return () => {
      cancelled = true;
      disconnectMcp(mcpClientRef.current);
      mcpClientRef.current = null;
    };
  }, [mcp]);

  // "Solo código" y "Thinking" son mutuamente excluyentes: combinarlos da un
  // 400 real de la API (el prefill "```" del turno assistant viola el
  // requisito de que ese turno empiece con un bloque thinking cuando
  // thinking está habilitado). Activar uno limpia y deshabilita el otro.
  function handleCodeOnlyChange(checked) {
    setCodeOnly(checked);
    if (checked) setThinking(false);
  }

  function handleThinkingChange(checked) {
    setThinking(checked);
    if (checked) setCodeOnly(false);
  }

  // Corre el guard de tamaño ANTES de guardar el adjunto en estado — un
  // archivo que excede MAX_BYTES nunca llega a leerse ni a mandarse (ver
  // features/documents.js). `e.target.value = ""` permite volver a elegir el
  // mismo archivo después de "Quitar" (el navegador no dispara onChange si
  // el path no cambió).
  function handleAttachmentChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const guard = guardAttachment(file);
    if (!guard.ok) {
      setError(guard.error);
      return;
    }

    setError(null);
    setAttachment(file);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    setError(null);
    setTrace([]);

    // Con adjunto, el turno user pasa de content:string (Fase 1) a un array
    // multi-bloque [{type:"text"}, image|document]. toContentBlock() es
    // async (FileReader), así que handleSend espera acá antes de armar
    // newMessages/mandar el request.
    let content = input;
    if (attachment) {
      const block = await toContentBlock(attachment);
      content = [{ type: "text", text: input }, block];
      setTrace((prev) => [
        ...prev,
        { type: "attachment", filename: attachment.name, mediaType: attachment.type },
      ]);
    }

    const newMessages = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    // Limpiamos el adjunto acá: ya quedó embebido en newMessages, no debe
    // reenviarse sin querer en el próximo turno.
    setAttachment(null);
    setLoading(true);

    try {
      const flags = { toolUse, webSearch, webSearchDomain, thinking, mcp, mcpClient: mcpClientRef.current };
      const { text, toolSteps, thinking: thinkingText, citations } = await sendMessage(
        newMessages,
        codeOnly,
        flags,
        (event) => setTrace((prev) => [...prev, event])
      );
      setMessages([
        ...newMessages,
        { role: "assistant", content: text, toolSteps, thinking: thinkingText, citations },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <h1>Chatbot Claude</h1>

      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 480px", minWidth: "320px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              marginBottom: "10px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={codeOnly}
                disabled={thinking}
                onChange={(e) => handleCodeOnlyChange(e.target.checked)}
              />
              Solo código (sin explicación)
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={toolUse}
                onChange={(e) => setToolUse(e.target.checked)}
              />
              Usar tool: fecha/hora
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={thinking}
                disabled={codeOnly}
                onChange={(e) => handleThinkingChange(e.target.checked)}
              />
              Usar extended thinking
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
              />
              Usar web search
            </label>

            {webSearch && (
              <input
                type="text"
                value={webSearchDomain}
                onChange={(e) => setWebSearchDomain(e.target.value)}
                placeholder="Restringir a dominio (opcional, ej: wikipedia.org)"
                style={{
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "1px solid #ddd",
                  fontSize: "13px",
                  minWidth: "220px",
                }}
              />
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={mcp}
                onChange={(e) => setMcp(e.target.checked)}
              />
              Usar MCP (servidor real)
            </label>
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
              Adjuntar imagen o PDF:
              <input type="file" accept="image/*,application/pdf" onChange={handleAttachmentChange} />
            </label>
            {attachment && (
              <div style={{ marginTop: "6px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                📎 {attachment.name}
                <button onClick={() => setAttachment(null)} style={removeAttachmentButtonStyle}>
                  Quitar
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              height: "400px",
              overflowY: "auto",
              padding: "15px",
              marginBottom: "15px",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#999" }}>
                No messages yet. Start typing!
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: "12px",
                  padding: "10px",
                  backgroundColor: msg.role === "user" ? "#007bff" : "#e9ecef",
                  color: msg.role === "user" ? "white" : "black",
                  borderRadius: "8px",
                  textAlign: msg.role === "user" ? "right" : "left",
                  maxWidth: "90%",
                  marginLeft: msg.role === "user" ? "auto" : "0",
                }}
              >
                {msg.toolSteps?.map((step, stepIdx) => (
                  <ToolStep
                    key={`tool-${idx}-${stepIdx}`}
                    name={step.name}
                    input={step.input}
                    result={step.result}
                  />
                ))}
                {msg.thinking && <ThinkingBlock thinking={msg.thinking} />}
                {renderMessageContent(msg.content)}
                {msg.citations?.length > 0 && (
                  <CitationList sources={msg.citations.map(formatCitationSource)} />
                )}
              </div>
            ))}

            {loading && (
              <div style={{ padding: "10px", color: "#999", fontStyle: "italic" }}>
                Claude is thinking...
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: "10px",
                marginBottom: "15px",
                borderRadius: "5px",
                backgroundColor: "#f8d7da",
                color: "#721c24",
                border: "1px solid #f5c6cb",
              }}
            >
              {error}
            </div>
          )}

          {!API_KEY && (
            <div
              style={{
                padding: "10px",
                marginBottom: "15px",
                borderRadius: "5px",
                backgroundColor: "#fff3cd",
                color: "#856404",
                border: "1px solid #ffeeba",
              }}
            >
              Missing VITE_ANTHROPIC_API_KEY. Copy .env.example to .env.local and set your key.
            </div>
          )}

          {mcpError && (
            <div
              style={{
                padding: "10px",
                marginBottom: "15px",
                borderRadius: "5px",
                backgroundColor: "#fff3cd",
                color: "#856404",
                border: "1px solid #ffeeba",
              }}
            >
              No se pudo conectar al servidor MCP ({mcpError}). Corré{" "}
              <code>python mcp-server/mcp_server.py</code> (con{" "}
              <code>mcp-server/requirements.txt</code> instalado) en una terminal aparte y
              volvé a activar el toggle "Usar MCP".
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your question..."
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "5px",
                border: "1px solid #ddd",
                fontSize: "14px",
              }}
            />

            <button
              onClick={handleSend}
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>

        <TracePanel trace={trace} />
      </div>
    </div>
  );
}
// endregion
