// Módulo puro (sin JSX, sin estado React) para la feature "MCP real en vivo" de
// Fase 3. Envuelve `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`)
// para hablar por HTTP con `proyecto_react/mcp-server/mcp_server.py` (Fase 1, Streamable
// HTTP + CORS). Es el equivalente funcional completo de la clase `MCPClient` real de
// "07 MCP/cli_project_COMPLETE/mcp_client.py": `connect`, `list_tools`, `call_tool`,
// `list_prompts`, `get_prompt`, `read_resource`, `cleanup` y el ciclo de entrada/salida
// (`__aenter__`/`__aexit__`) tienen acá un equivalente real y ejercitable, ninguno
// recortado ni placeholder. El resto del wiring (toggle, `useRef`, merge en `tools[]`,
// dispatch en el loop de `tool_use`) vive en Chatbot.jsx — ver design.md.
//
// API real verificada contra el paquete instalado (`@modelcontextprotocol/sdk@1.29.0`,
// resuelto por `npm install` en esta fase — ver package.json/package-lock.json), leyendo
// directamente sus `.d.ts` en node_modules antes de escribir este archivo:
// - `new Client(implementation, options?)` — constructor real de la clase `Client`.
// - `client.connect(transport)` hace el handshake `initialize` (equivalente a
//   `MCPClient.connect()` + `ClientSession.initialize()` en Python).
// - `client.listTools()` → `{ tools: [{ name, description, inputSchema, ... }] }`.
// - `client.callTool({ name, arguments })` → resultado crudo `{ content, isError, ... }`.
// - `client.listPrompts()` → `{ prompts: [...] }`.
// - `client.getPrompt({ name, arguments })` → `{ messages: [...] }`.
// - `client.readResource({ uri })` → `{ contents: [...] }`.
// - `client.close()` (heredado de la clase base `Protocol`) es el cleanup real — el SDK
//   JS no expone un método `cleanup()` separado como el `AsyncExitStack` de Python.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// region: URL del servidor MCP
// Servidor real de Fase 1 (`proyecto_react/mcp-server/mcp_server.py`), corrido a mano vía
// `uvicorn` en este host/puerto — ver README.md, sección "Fase 3: MCP server". Constante
// top-level, no configurable desde la UI (mismo criterio que otras URLs fijas del
// proyecto): cambiar el servidor implica cambiar código, no un input de texto.
export const MCP_SERVER_URL = "http://127.0.0.1:8000/mcp";
// endregion

// region: connectMcp
// Equivalente de `MCPClient.connect()` (y del `__aenter__` de Python): crea el `Client` y
// el transporte Streamable HTTP, y completa el handshake `initialize` contra el servidor
// real. Devuelve la instancia de `Client` ya conectada. Si el servidor no está corriendo
// (o falla CORS), `client.connect()` rechaza la promesa — quien llama (Chatbot.jsx) DEBE
// capturar ese error y mostrar el banner de fallo visible, nunca dejarlo sin manejar (ver
// "Manejo de Error Visible Si el Servidor MCP No Está Corriendo" en spec.md).
export async function connectMcp() {
  const client = new Client({ name: "chatbot-fase3", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  await client.connect(transport);
  return client;
}
// endregion

// region: listMcpTools
// Equivalente de `MCPClient.list_tools()`. Devuelve las tools reales del servidor ya
// convertidas al shape que espera el array `tools[]` de la Messages API de Claude
// (`{name, description, input_schema}`) — la conversión vive acá, no en Chatbot.jsx, para
// que el wiring no necesite conocer el shape crudo `inputSchema` que devuelve el SDK.
export async function listMcpTools(client) {
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema,
  }));
}
// endregion

// region: callMcpTool
// Equivalente de `MCPClient.call_tool()`. Ejecuta una tool real contra el servidor y
// devuelve el resultado crudo (`{content, isError, ...}`) tal cual lo entrega el SDK —
// quien llama (Chatbot.jsx) DEBE validar el contenido antes de renderizar, nunca asumir
// `content[0].text` a ciegas (mismo requerimiento que en Python, donde `call_tool`
// también devuelve el `CallToolResult` crudo sin desempaquetar).
export async function callMcpTool(client, name, input) {
  return client.callTool({ name, arguments: input });
}
// endregion

// region: listMcpPrompts
// Equivalente de `MCPClient.list_prompts()`.
export async function listMcpPrompts(client) {
  const { prompts } = await client.listPrompts();
  return prompts;
}
// endregion

// region: getMcpPrompt
// Equivalente de `MCPClient.get_prompt()`. `args` es un `Record<string, string>` (mismo
// tipo que en el cliente Python) con los argumentos del prompt.
export async function getMcpPrompt(client, name, args) {
  const { messages } = await client.getPrompt({ name, arguments: args });
  return messages;
}
// endregion

// region: readMcpResource
// Equivalente de `MCPClient.read_resource()`, incluyendo el mismo comportamiento de
// parseo: si el primer content es texto con `mimeType: "application/json"` se devuelve
// parseado (`JSON.parse`), si es texto plano se devuelve tal cual, y si no es texto
// (ej. contenido binario en base64) se devuelve el content crudo sin asumir `.text`.
export async function readMcpResource(client, uri) {
  const { contents } = await client.readResource({ uri });
  const resource = contents[0];

  if (resource && typeof resource.text === "string") {
    if (resource.mimeType === "application/json") {
      return JSON.parse(resource.text);
    }
    return resource.text;
  }

  return resource;
}
// endregion

// region: disconnectMcp
// Equivalente de `MCPClient.cleanup()` (y del `__aexit__` de Python): cierra la conexión
// real. El SDK JS no separa "session" de "exit stack" como en Python — `client.close()`
// (heredado de la clase base `Protocol`) es el único paso necesario. No lanza si `client`
// es `null`/`undefined`, para poder llamarlo sin guard extra desde el cleanup de un
// `useEffect` que puede correr antes de que la conexión exista.
export async function disconnectMcp(client) {
  if (!client) {
    return;
  }
  await client.close();
}
// endregion
