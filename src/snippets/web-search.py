# Web search example — tool server-side web_search_20250305 con dominio
# permitido configurable.
#
# Scope note: reusa el mismo chat()/add_user_message/add_assistant_message
# que tool-use.py (la versión más pulida de "06 Claude tools/005_caching.ipynb"),
# y suma el equivalente Python de buildWebSearchTool() de
# src/features/webSearch.js: una función que arma la tool dinámicamente en
# vez de una constante hardcodeada, porque el dominio permitido es
# configurable (decisión final: revierte el propose original que lo tenía
# fijo en código sin controles UI).
#
# A diferencia de tool-use.py, acá no hay loop local: web_search es una tool
# SERVER-SIDE, Anthropic la ejecuta y devuelve el resultado ya resuelto en la
# misma response, interleaved con bloques server_tool_use /
# web_search_tool_result antes del bloque de texto final.

# region: Imports y configuración del cliente
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


# region: Construcción dinámica de la tool web_search
# Equivalente en Python a buildWebSearchTool() de src/features/webSearch.js:
# `allowed_domain` es opcional. Si es None (o cadena vacía), la tool se manda
# sin `allowed_domains` — búsqueda sin restricción. `max_uses` queda fijo en 3.
def build_web_search_tool(allowed_domain=None):
    tool = {
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": 3,
    }
    if allowed_domain:
        tool["allowed_domains"] = [allowed_domain]
    return tool
# endregion


# region: Ejemplo de uso
# web_search es server-side: no hay loop local ni execute_tool() que llamar,
# la response final ya trae el texto resuelto con los resultados de búsqueda
# interleaved (bloques server_tool_use / web_search_tool_result antes del
# texto). Igual que con documentos+citations, los bloques de texto pueden
# traer su propio array `.citations` — acá con `url` en vez de número de
# página, apuntando a la página real que Claude citó.
messages = []
add_user_message(messages, "¿Cuáles fueron las noticias más importantes de hoy sobre IA?")

web_search_tool = build_web_search_tool(allowed_domain="wikipedia.org")
response = chat(messages, tools=[web_search_tool])
add_assistant_message(messages, response)

text_blocks = [block for block in response.content if block.type == "text"]
final_text = "".join(block.text for block in text_blocks)
print(final_text)

for block in text_blocks:
    for citation in getattr(block, "citations", None) or []:
        # `cited_text` es el fragmento EXACTO de la página que respalda la
        # afirmación — no solo el link, sino qué parte puntual se usó.
        print(f"  Fuente: {citation.title} ({citation.url})")
        print(f"  Texto citado: \"{citation.cited_text}\"")
# endregion
