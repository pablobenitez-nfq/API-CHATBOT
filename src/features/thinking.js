// Módulo puro (sin JSX, sin estado React) para la feature "Extended
// thinking" de Fase 4. Expone el budget por defecto y el helper que arma el
// parámetro `thinking` del body de /v1/messages. El resto del flujo
// (extraer el bloque thinking de la response, subir max_tokens por encima
// del budget, mostrarlo con ThinkingBlock) vive en Chatbot.jsx, igual que
// con tool use/web search.

// region: Parámetro thinking
// Budget por defecto en tokens para el razonamiento interno del modelo.
export const DEFAULT_BUDGET_TOKENS = 2000;

// Arma el parámetro `thinking` del body de /v1/messages. `budget` es
// opcional (usa DEFAULT_BUDGET_TOKENS si no se pasa). La API requiere que
// `max_tokens` sea mayor a `budget_tokens` cuando thinking está habilitado
// — eso lo resuelve quien llama a esta función (ver buildRequestBody /
// sendMessage en Chatbot.jsx).
export function buildThinkingParam(budget = DEFAULT_BUDGET_TOKENS) {
  return {
    type: "enabled",
    budget_tokens: budget,
  };
}
// endregion
