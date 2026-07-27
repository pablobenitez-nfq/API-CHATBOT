// Nota explicativa en prosa para la 6ta pestaña de CodeViewer ("MCP").
// Excepción deliberada al patrón del resto de src/features/*.js: este
// módulo NO define JSX ni componentes React, NO es importado por
// Chatbot.jsx, y no ejecuta nada. Su único rol es servir de `jsxRaw` para
// la entrada `mcp` de FEATURES[] en CodeViewer.jsx — mismo mecanismo de
// parseRegions()/CodeSection que las demás features, pero con contenido de
// prosa en vez de código vivo. El código MCP real y ejecutable vive en
// src/snippets/mcp-integration.py (pestaña Python de la misma entrada).

// region: Qué es MCP
// MCP (Model Context Protocol) es un protocolo cliente-servidor: un
// servidor MCP expone "primitivas" que un cliente puede consumir. La
// primitiva cubierta en esta fase es tools (funciones que el modelo puede
// invocar, igual que las tools client-side de la Fase 2 de este chatbot).
// El protocolo también define resources (datos que el servidor puede
// exponer para lectura) y prompts (templates de prompt reutilizables que
// el servidor ofrece), pero ninguna de las dos se cubre en este snippet —
// el servidor real del curso (07 MCP/cli_project_COMPLETE/mcp_server.py)
// las implementa, pero quedan fuera de esta vidriera educativa a propósito
// para mantener el foco en tool use.
// endregion

// region: Por qué esto no corre en el navegador
// MCP local — el único transporte presente en las fuentes reales del
// curso — usa stdio como transporte: el cliente (mcp_client.py) spawnea el
// servidor (mcp_server.py) como un proceso hijo del sistema operativo,
// usando StdioServerParameters y stdio_client, y se comunica con él
// escribiendo/leyendo sobre sus streams estándar de entrada/salida. Un SPA
// corriendo en el navegador no tiene acceso a la API del sistema operativo
// para spawnear procesos ni para hablar stdio — esa capacidad simplemente
// no existe en el sandbox del browser. Ejecutar MCP real desde este
// chatbot exigiría reescribir el transporte a algo HTTP-based
// (Streamable HTTP, parte de la spec de MCP pero no implementado en las
// fuentes de este curso) más un servidor intermedio que sí pueda correr
// ese transporte — ambos explícitamente fuera de alcance de esta fase.
// endregion

// region: Paralelismo con tool-use
// TOOL_DEFINITION en src/features/toolUse.js es client-side: un objeto
// {name, description, input_schema} escrito a mano por el desarrollador,
// que vive en el código del chatbot y no cambia salvo que alguien lo edite.
// Una tool servida por un servidor MCP tiene exactamente el mismo shape de
// cara a la API de Claude, pero se arma de otra forma: ToolManager.
// get_all_tools() (ver core/tools.py, y su versión curada en
// src/snippets/mcp-integration.py) le pregunta al servidor MCP qué tools
// tiene disponibles vía list_tools() y convierte cada mcp.types.Tool
// (name, description, inputSchema) a ese mismo contrato
// {name, description, input_schema}. Mismo contrato hacia la API, distinta
// fuente de verdad: código estático de un lado, descubrimiento en runtime
// contra un servidor del otro.
// endregion

// region: Dónde está el código real
// El código fuente completo y original de este ejemplo vive en
// "07 MCP/cli_project_COMPLETE/" (mcp_server.py define la tool
// read_doc_contents junto con edit_document, dos resources y un prompt;
// mcp_client.py implementa la clase MCPClient completa; core/tools.py
// implementa ToolManager con get_all_tools() y la ejecución de tool
// requests). La versión curada y recortada que se muestra en la pestaña
// Python de este mismo panel es src/snippets/mcp-integration.py — un
// subconjunto fiel de esas tres fuentes, acotado a tool use únicamente.
// endregion
