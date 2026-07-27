// Shells de renderizado para los bloques de contenido de Fase 2 (tool use,
// extended thinking, citations). Hoy ninguno está conectado a una feature
// real: no hay ningún flujo en Chatbot.jsx que produzca bloques thinking/
// tool_use/tool_result/citations todavía. Estos componentes solo dejan la
// estructura visual lista, con el mismo estilo dark del panel de código
// (ver codeBlockStyle en Chatbot.jsx / preStyle en CodeViewer.jsx), para
// conectarlos sin reescribirlos cuando cada feature de Fase 2 aterrice.

// region: ThinkingBlock
// Bloque de "pensamiento extendido" (Fase 4, requirement "Extended
// Thinking"). Colapsable por defecto vía <details> nativo, para no mostrar
// el razonamiento largo del modelo a menos que el usuario lo pida.
export function ThinkingBlock({ thinking }) {
  return (
    <details style={thinkingDetailsStyle}>
      <summary style={thinkingSummaryStyle}>Ver razonamiento</summary>
      <div style={thinkingBodyStyle}>{thinking}</div>
    </details>
  );
}

const thinkingDetailsStyle = {
  backgroundColor: "#1e1e1e",
  color: "#eaeaea",
  borderRadius: "6px",
  margin: "6px 0",
  padding: "8px 10px",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: "13px",
};

const thinkingSummaryStyle = {
  cursor: "pointer",
  color: "#9da5b4",
  fontStyle: "italic",
};

const thinkingBodyStyle = {
  marginTop: "8px",
  whiteSpace: "pre-wrap",
  color: "#eaeaea",
};
// endregion

// region: ToolStep
// Indicador de un paso de tool use (Fase 2, requirement "Tool Use"): qué
// tool está usando Claude, con qué input, y el resultado que devolvió la
// ejecución local. `input` y `result` son opcionales porque, mientras el
// loop está en curso, el resultado todavía no existe.
export function ToolStep({ name, input, result }) {
  return (
    <div style={toolStepStyle}>
      <div style={toolStepHeaderStyle}>Claude está usando la tool: {name}</div>
      {input !== undefined && (
        <pre style={toolStepPreStyle}>{JSON.stringify(input, null, 2)}</pre>
      )}
      {result !== undefined && (
        <div style={toolStepResultStyle}>
          <strong>Resultado:</strong>
          <pre style={toolStepPreStyle}>
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const toolStepStyle = {
  backgroundColor: "#1e1e1e",
  color: "#eaeaea",
  borderRadius: "6px",
  margin: "6px 0",
  padding: "10px",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: "13px",
};

const toolStepHeaderStyle = {
  color: "#9da5b4",
  fontStyle: "italic",
  marginBottom: "6px",
};

const toolStepPreStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  overflowX: "auto",
};

const toolStepResultStyle = {
  marginTop: "6px",
};
// endregion

// region: CitationBadge
// Badge `[n]` para citas de documentos (Fase 5, requirement "Upload de
// documento/imagen con Citations"): clickeable, con tooltip nativo
// (`title`) mostrando la fuente. `CitationList` acompaña al badge
// renderizando la lista completa de fuentes al pie del mensaje, tal como
// lo describe el design (badge inline + lista al pie, no resaltado
// inline).
export function CitationBadge({ index, source, onClick }) {
  return (
    <sup
      style={citationBadgeStyle}
      title={source}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      [{index}]
    </sup>
  );
}

// `sources` acepta strings (formato viejo) u objetos `{ text, url, citedText }`.
// Con `url`, la fuente se renderiza como link clickeable — así sirve tanto
// para citas de documentos (PDF, sin url, solo página) como de web search
// (con url a la página real). Con `citedText`, se muestra además el
// fragmento exacto que la API devolvió como evidencia de la afirmación (el
// campo `cited_text` de la citation) — es la parte más útil para entender
// de dónde salió realmente cada dato, no solo el nombre de la fuente.
export function CitationList({ sources }) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div style={citationListStyle}>
      <strong>Fuentes:</strong>
      <ol style={citationListOlStyle}>
        {sources.map((source, i) => {
          const { text, url, citedText } =
            typeof source === "string" ? { text: source, url: null, citedText: null } : source;
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" style={citationLinkStyle}>
                  {text}
                </a>
              ) : (
                text
              )}
              {citedText && <blockquote style={citedTextStyle}>&ldquo;{citedText}&rdquo;</blockquote>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const citationBadgeStyle = {
  cursor: "pointer",
  color: "#61afef",
  fontWeight: "bold",
  marginLeft: "2px",
};

const citationListStyle = {
  marginTop: "8px",
  padding: "8px 10px",
  backgroundColor: "#1e1e1e",
  color: "#eaeaea",
  borderRadius: "6px",
  fontSize: "12px",
};

const citationLinkStyle = {
  color: "#61afef",
};

const citedTextStyle = {
  margin: "4px 0 0",
  paddingLeft: "8px",
  borderLeft: "2px solid #444",
  color: "#9da5b4",
  fontStyle: "italic",
};

const citationListOlStyle = {
  margin: "4px 0 0 18px",
  padding: 0,
};
// endregion
