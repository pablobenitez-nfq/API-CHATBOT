import React from "react";

// Panel de "qué está pasando en vivo": muestra, a medida que ocurren, los
// requests/responses reales que manda el chat (incluyendo los pasos
// intermedios del loop de tool use), para que alguien que lo ve por primera
// vez entienda exactamente qué llamadas se están haciendo y qué devuelven.
// Se resetea al mandar cada mensaje nuevo — muestra el intercambio actual,
// no el historial completo de la conversación.

// region: TracePanel
export default function TracePanel({ trace }) {
  return (
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0 }}>Qué está pasando</h3>
      {trace.length === 0 && (
        <div style={{ color: "#999", fontStyle: "italic" }}>
          Mandá un mensaje para ver acá las llamadas reales a la API.
        </div>
      )}
      {trace.map((event, i) => (
        <TraceEntry key={i} event={event} />
      ))}
    </div>
  );
}

function TraceEntry({ event }) {
  if (event.type === "request") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>→ Request enviado</div>
        <pre style={preStyle}>{JSON.stringify(event.body, null, 2)}</pre>
      </div>
    );
  }

  if (event.type === "response") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>← Respuesta recibida</div>
        <pre style={preStyle}>{JSON.stringify(event.result, null, 2)}</pre>
      </div>
    );
  }

  if (event.type === "tool_execution") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>⚙ Ejecutando tool localmente: {event.name}</div>
        <pre style={preStyle}>
          {`input: ${JSON.stringify(event.input, null, 2)}\nresultado: ${
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result, null, 2)
          }`}
        </pre>
      </div>
    );
  }

  if (event.type === "web_search") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>
          🌐 Web search server-side{event.query ? `: "${event.query}"` : ""}
        </div>
        <pre style={preStyle}>
          {event.results
            ? JSON.stringify(event.results, null, 2)
            : "Buscando (resultado todavía no llegó)..."}
        </pre>
      </div>
    );
  }

  if (event.type === "thinking") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>🧠 Extended thinking</div>
        <pre style={preStyle}>{event.thinking}</pre>
      </div>
    );
  }

  if (event.type === "attachment") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>📎 Adjunto procesado</div>
        <pre style={preStyle}>{`archivo: ${event.filename}\ntipo: ${event.mediaType}`}</pre>
      </div>
    );
  }

  // Fase 4: resources/prompt MCP verificados fuera de tools[] (los botones
  // "Listar recursos MCP"/"Ver prompt 'format'" de Chatbot.jsx empujan estos
  // eventos directamente, sin pasar por sendMessage). `event.error`, si está
  // presente, viene del catch del handler correspondiente (servidor caído u
  // otro fallo) — se muestra en el mismo <pre> en vez del resultado real.
  if (event.type === "mcp_resource") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>📄 Resource MCP: {event.uri}</div>
        <pre style={preStyle}>
          {event.error ? `error: ${event.error}` : JSON.stringify(event.result, null, 2)}
        </pre>
      </div>
    );
  }

  if (event.type === "mcp_prompt") {
    return (
      <div style={entryStyle}>
        <div style={labelStyle}>📝 Prompt MCP: {event.name}</div>
        <pre style={preStyle}>
          {event.error ? `error: ${event.error}` : JSON.stringify(event.messages, null, 2)}
        </pre>
      </div>
    );
  }

  return null;
}

const panelStyle = {
  flex: "1 1 380px",
  minWidth: "320px",
  maxHeight: "600px",
  overflowY: "auto",
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "15px",
  backgroundColor: "#161616",
  color: "#eaeaea",
};

const entryStyle = {
  marginBottom: "14px",
};

const labelStyle = {
  fontWeight: "bold",
  color: "#9da5b4",
  marginBottom: "4px",
  fontSize: "13px",
};

const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: "12px",
  backgroundColor: "#1e1e1e",
  padding: "8px",
  borderRadius: "6px",
  maxHeight: "220px",
  overflowY: "auto",
};
// endregion
