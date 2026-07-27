// Módulo puro (sin JSX, sin estado React) para la feature "Web search" de
// Fase 3. A diferencia de toolUse.js, esta es una tool SERVER-SIDE: Anthropic
// la ejecuta directamente, no hay ninguna ejecución local ni loop de
// tool_result que armar acá — el loop de tool use en Chatbot.jsx no se
// entera de esta tool, solo la ofrece en `tools`.
//
// Decisión final (revierte al propose original, que hardcodeaba
// allowed_domains sin controles UI): el dominio permitido es configurable
// desde la UI, no hardcodeado en código. Por eso este módulo expone una
// función que arma la tool dinámicamente en vez de una constante fija.

// region: Construcción dinámica de la tool web_search
// Arma la definición de la tool server-side `web_search_20250305`.
// `allowedDomain` es opcional: si es falsy (string vacío incluido), la tool
// se manda SIN `allowed_domains` — búsqueda sin restricción de dominio.
// `max_uses` queda fijo en 3 independientemente del dominio.
export function buildWebSearchTool(allowedDomain) {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
    ...(allowedDomain ? { allowed_domains: [allowedDomain] } : {}),
  };
}
// endregion
