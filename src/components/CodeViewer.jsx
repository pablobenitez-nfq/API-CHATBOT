import React, { useState } from "react";
import jsxSource from "./Chatbot.jsx?raw";
import pySnippet from "../snippets/basic-request.py?raw";
import toolUseFeatureRaw from "../features/toolUse.js?raw";
import toolUsePySnippet from "../snippets/tool-use.py?raw";
import webSearchFeatureRaw from "../features/webSearch.js?raw";
import webSearchPySnippet from "../snippets/web-search.py?raw";
import thinkingFeatureRaw from "../features/thinking.js?raw";
import thinkingPySnippet from "../snippets/thinking.py?raw";
import documentsFeatureRaw from "../features/documents.js?raw";
import documentsPySnippet from "../snippets/documents-citations.py?raw";
import mcpNoteRaw from "../features/mcpNote.js?raw";
import mcpIntegrationPySnippet from "../snippets/mcp-integration.py?raw";

// Splits raw source into labeled sections delimited by
// `// region: Title` / `// endregion` (or `# region:` / `# endregion`
// for Python) comments left in the actual source files.
function parseRegions(source) {
  const regionPattern = /(?:\/\/|#)\s*region:\s*(.+)\n([\s\S]*?)(?:\/\/|#)\s*endregion/g;
  const regions = [];
  let match;
  while ((match = regionPattern.exec(source)) !== null) {
    regions.push({ title: match[1].trim(), code: match[2].trim() });
  }
  return regions;
}

// Una entrada por feature (chat básico ahora; tool use / web search /
// thinking / citations / playground de evaluación después). Cada una trae
// su JSX real (?raw, siempre sincronizado) y su snippet Python curado.
// Para sumar una feature de Fase 2/3, agregar un objeto acá — el resto del
// componente ya sabe listarla y mostrarla, no hace falta tocar nada más.
const FEATURES = [
  {
    id: "chat-basico",
    label: "Chat básico",
    jsxRaw: jsxSource,
    pyRaw: pySnippet,
  },
  {
    id: "tool-use",
    label: "Tool use",
    jsxRaw: toolUseFeatureRaw,
    pyRaw: toolUsePySnippet,
  },
  {
    id: "web-search",
    label: "Web search",
    jsxRaw: webSearchFeatureRaw,
    pyRaw: webSearchPySnippet,
  },
  {
    id: "thinking",
    label: "Thinking",
    jsxRaw: thinkingFeatureRaw,
    pyRaw: thinkingPySnippet,
  },
  {
    id: "documents-citations",
    label: "Documents & Citations",
    jsxRaw: documentsFeatureRaw,
    pyRaw: documentsPySnippet,
  },
  // Excepción al patrón "jsxRaw = código vivo importado por Chatbot.jsx": esta
  // entrada no ejecuta MCP en el navegador (MCP local es stdio, un proceso
  // hijo que un SPA no puede spawnear). jsxRaw acá es mcpNote.js, una nota
  // explicativa en prosa (mismo formato de regions, sin JSX ni componentes
  // fabricados) — el snippet Python (pyRaw) sí es código MCP real y ejecutable,
  // tomado de 07 MCP/cli_project_COMPLETE/.
  {
    id: "mcp",
    label: "MCP",
    jsxRaw: mcpNoteRaw, // ⚠️ excepción: NO es código vivo, ver comentario arriba
    pyRaw: mcpIntegrationPySnippet,
  },
];

const preStyle = {
  backgroundColor: "#1e1e1e",
  color: "#eaeaea",
  padding: "15px",
  borderRadius: "8px",
  overflowX: "auto",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: 0,
};

const copyButtonStyle = {
  padding: "4px 12px",
  borderRadius: "4px",
  border: "1px solid #ddd",
  cursor: "pointer",
  backgroundColor: "#f0f0f0",
  fontSize: "13px",
};

const copyAllButtonStyle = {
  ...copyButtonStyle,
  backgroundColor: "#007bff",
  color: "white",
  border: "none",
  fontWeight: "bold",
};

function tabStyle(active) {
  return {
    padding: "8px 16px",
    borderRadius: "5px",
    border: "1px solid #ddd",
    cursor: "pointer",
    backgroundColor: active ? "#007bff" : "#f0f0f0",
    color: active ? "white" : "black",
  };
}

function CodeSection({ title, code }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button onClick={handleCopy} style={copyButtonStyle}>
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
      <pre style={preStyle}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function CodeViewer() {
  const [featureId, setFeatureId] = useState(FEATURES[0].id);
  const [language, setLanguage] = useState("jsx"); // "jsx" | "python"
  const [copiedAll, setCopiedAll] = useState(false);

  const feature = FEATURES.find((f) => f.id === featureId);
  const regions = parseRegions(language === "jsx" ? feature.jsxRaw : feature.pyRaw);

  async function handleCopyAll() {
    const combined = regions
      .map((region) => `===== ${region.title} =====\n${region.code}`)
      .join("\n\n");
    await navigator.clipboard.writeText(combined);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  return (
    <div>
      {/* Selector de feature: solo aparece cuando hay más de una (Fase 2/3) */}
      {FEATURES.length > 1 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {FEATURES.map((f) => (
            <button
              key={f.id}
              onClick={() => setFeatureId(f.id)}
              style={tabStyle(featureId === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setLanguage("jsx")} style={tabStyle(language === "jsx")}>
            JSX (React)
          </button>
          <button
            onClick={() => setLanguage("python")}
            style={tabStyle(language === "python")}
          >
            Python
          </button>
        </div>

        <button onClick={handleCopyAll} style={copyAllButtonStyle}>
          {copiedAll ? "¡Todo copiado!" : "Copiar todo"}
        </button>
      </div>

      {regions.map((region) => (
        <CodeSection key={region.title} title={region.title} code={region.code} />
      ))}
    </div>
  );
}
