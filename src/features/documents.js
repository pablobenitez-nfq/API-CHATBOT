// Módulo puro (sin JSX, sin estado React) para la feature "Documents &
// Citations" de Fase 5. Expone los límites documentados de la API, el guard
// de tamaño que corta el flujo ANTES de leer el archivo, y el helper que
// codifica el archivo a base64 y arma el content block (image o document)
// correspondiente. El resto del flujo (armar el turno user con content[]
// multi-bloque, leer citations de la response, renderizar CitationList) vive
// en Chatbot.jsx, igual que con las demás features de Fase 2.

// region: Límites documentados de la API
// MAX_BYTES es el límite documentado por Anthropic para adjuntos base64: 32MB
// por archivo. MAX_PAGES es una heurística best-effort para PDFs: contar
// páginas reales requeriría parsear el PDF client-side (leer todo el
// archivo primero), lo cual no es compatible con el objetivo de rechazar
// ANTES de leer — por eso queda documentado acá como guardrail suave, no
// como un chequeo activo. La API es la autoridad final para casos límite de
// páginas (ver design.md, "Decisiones sobre preguntas abiertas").
export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_PAGES = 100;
// endregion

// region: guardAttachment
// Valida el tamaño del archivo de forma síncrona e inmediata usando
// `file.size` — corta el flujo ANTES de leerlo con FileReader, evitando
// gastar tiempo/memoria en codificar un archivo que de todos modos va a ser
// rechazado. El chequeo de MAX_PAGES se omite deliberadamente acá: es solo
// heurístico y la única forma de aproximarlo requeriría haber leído el
// archivo primero, así que queda fuera del guard síncrono (ver comentario de
// MAX_PAGES arriba).
export function guardAttachment(file) {
  if (!file) {
    return { ok: false, error: "No se seleccionó ningún archivo." };
  }

  if (file.size > MAX_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const limitMb = MAX_BYTES / (1024 * 1024);
    return {
      ok: false,
      error: `El archivo pesa ${sizeMb}MB, supera el límite de ${limitMb}MB permitido por la API.`,
    };
  }

  return { ok: true };
}
// endregion

// region: toContentBlock
// Lee el archivo con FileReader, lo codifica a base64 y arma el content
// block correspondiente según el tipo MIME: imagen → {type:"image", ...},
// PDF → {type:"document", ..., title, citations:{enabled:true}}. Es async
// porque FileReader es basado en eventos — quien llama (Chatbot.jsx) debe
// esperar esta promesa antes de armar el turno user con content[] multi-
// bloque.
export async function toContentBlock(file) {
  const base64 = await readFileAsBase64(file);

  if (file.type.startsWith("image/")) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: file.type,
        data: base64,
      },
    };
  }

  if (file.type === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
      title: file.name,
      citations: { enabled: true },
    };
  }

  throw new Error(`Tipo de archivo no soportado: ${file.type}`);
}

// FileReader.readAsDataURL produce "data:<mime>;base64,<data>" — nos
// quedamos solo con la parte de datos después de la coma.
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
// endregion
