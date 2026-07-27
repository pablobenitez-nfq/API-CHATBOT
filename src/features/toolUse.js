// Módulo puro (sin JSX, sin estado React) para la feature "Tool use" de
// Fase 2. Expone la definición de la tool cliente `get_current_datetime` y
// su ejecución local. El loop de tool use en sí (reenviar el request
// mientras stop_reason == "tool_use") vive en Chatbot.jsx — ver design.md,
// que reserva ese loop ahí porque debe combinar tools + thinking +
// documentos, no solo esta tool.

// region: Definición de la tool get_current_datetime
// Tool cliente (ejecutada localmente, no server-side) que le permite al
// modelo pedir la fecha/hora actual del sistema donde corre el chatbot. Sin
// parámetros requeridos: alcanza para el caso de uso de esta fase y
// mantiene el loop de tool use simple.
export const TOOL_DEFINITION = {
  name: "get_current_datetime",
  description:
    "Devuelve la fecha y hora actual del sistema donde corre el cliente, como texto legible. Usar cuando el usuario pregunte qué hora o fecha es ahora mismo, o necesite calcular algo relativo al momento actual.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};
// endregion

// region: Ejecución local de tools
// Punto de entrada único para ejecutar cualquier tool cliente declarada en
// este módulo. Hoy solo existe `get_current_datetime`; si en el futuro se
// suman más tools locales, alcanza con agregar un caso acá — el loop de
// Chatbot.jsx no necesita cambiar.
export function executeTool(name, input) {
  if (name === "get_current_datetime") {
    return new Date().toString();
  }

  throw new Error(`Tool desconocida: ${name}`);
}
// endregion
