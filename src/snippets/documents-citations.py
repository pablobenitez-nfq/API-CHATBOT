# Document upload + citations example — lee un PDF local, lo codifica en
# base64, arma un content block "document" con citations habilitadas, lo
# manda en un mensaje multi-bloque (texto + documento) y lee las citations
# devueltas en la respuesta.
#
# Scope note: reusa el mismo chat()/add_user_message/add_assistant_message
# que tool-use.py / web-search.py / thinking.py (la versión más pulida de
# "06 Claude tools/005_caching.ipynb"). Equivalente Python de
# guardAttachment()/toContentBlock() de src/features/documents.js: el guard
# de tamaño corre ANTES de leer el archivo, y la codificación a base64 arma
# el mismo content block document/image con citations:{"enabled": True}.

# region: Imports y configuración del cliente
import base64
import os

from dotenv import load_dotenv
from anthropic import Anthropic
from anthropic.types import Message

load_dotenv()

client = Anthropic()
model = "claude-sonnet-4-5"
# endregion


# region: Funciones auxiliares
def add_user_message(messages, message):
    user_message = {
        "role": "user",
        "content": message.content if isinstance(message, Message) else message,
    }
    messages.append(user_message)


def add_assistant_message(messages, message):
    assistant_message = {
        "role": "assistant",
        "content": message.content if isinstance(message, Message) else message,
    }
    messages.append(assistant_message)
# endregion


# region: Función chat()
def chat(
    messages,
    system=None,
    temperature=1.0,
    stop_sequences=[],
    tools=None,
    thinking=False,
    thinking_budget=1024,
):
    params = {
        "model": model,
        "max_tokens": 4000,
        "messages": messages,
        "temperature": temperature,
        "stop_sequences": stop_sequences,
    }

    if thinking:
        params["thinking"] = {
            "type": "enabled",
            "budget_tokens": thinking_budget,
        }

    if tools:
        params["tools"] = tools

    if system:
        params["system"] = [
            {
                "type": "text",
                "text": system,
            }
        ]

    message = client.messages.create(**params)
    return message
# endregion


# region: Guardrails y codificación de documentos
# Límite documentado por la API: 32MB por archivo. MAX_PAGES es una
# heurística best-effort (no exacta) para PDFs — la API es la autoridad
# final para casos límite de páginas. Equivalente a
# guardAttachment()/MAX_BYTES/MAX_PAGES de src/features/documents.js.
MAX_BYTES = 32 * 1024 * 1024
MAX_PAGES = 100


def guard_attachment(path):
    size = os.path.getsize(path)
    if size > MAX_BYTES:
        size_mb = size / (1024 * 1024)
        limit_mb = MAX_BYTES / (1024 * 1024)
        return False, f"El archivo pesa {size_mb:.1f}MB, supera el límite de {limit_mb}MB."
    return True, None


def build_document_block(path, title=None):
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")

    return {
        "type": "document",
        "source": {
            "type": "base64",
            "media_type": "application/pdf",
            "data": data,
        },
        "title": title or os.path.basename(path),
        "citations": {"enabled": True},
    }
# endregion


# region: Ejemplo de uso
# El turno user es multi-bloque: texto de la pregunta + el documento. Con
# citations habilitadas, los bloques de texto de la respuesta pueden traer un
# array `.citations` con objetos que incluyen `document_title`,
# `start_page_number`, `end_page_number`, entre otros, para PDFs.
pdf_path = "informe.pdf"
ok, error = guard_attachment(pdf_path)
if not ok:
    raise ValueError(error)

document_block = build_document_block(pdf_path)

messages = []
add_user_message(
    messages,
    [
        {"type": "text", "text": "Resumí los puntos principales de este documento."},
        document_block,
    ],
)

response = chat(messages)
add_assistant_message(messages, response)

for block in response.content:
    if block.type != "text":
        continue
    print(block.text)
    for citation in getattr(block, "citations", None) or []:
        pages = f"pág. {citation.start_page_number}-{citation.end_page_number}"
        # `cited_text` es el fragmento EXACTO de la fuente que respalda la
        # afirmación — no solo de dónde salió, sino qué parte puntual se usó.
        print(f"  Fuente: {citation.document_title} ({pages})")
        print(f"  Texto citado: \"{citation.cited_text}\"")
# endregion
