# Extended thinking example — activa thinking=True/thinking_budget=N en
# chat() y lee el bloque de razonamiento de la respuesta.
#
# Scope note: reusa el mismo chat()/add_user_message/add_assistant_message
# que tool-use.py / web-search.py (la versión más pulida de
# "06 Claude tools/005_caching.ipynb") — chat() ya acepta thinking=True y
# thinking_budget=N, no hace falta tocar la función.
#
# Regla dura (ver Chatbot.jsx / design.md): extended thinking es incompatible
# con el modo "solo código" (prefill del turno assistant con "```"), porque
# la API exige que el turno del assistant empiece con un bloque thinking
# cuando thinking está habilitado. Este ejemplo no combina ambos.

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


# region: Ejemplo de uso
# Con thinking=True, la response antepone un bloque type=="thinking" (con el
# razonamiento en .thinking) antes del bloque de texto final. max_tokens
# (4000, fijo en chat()) queda por encima del thinking_budget de acá abajo
# (2000), tal como exige la API cuando thinking está habilitado.
messages = []
add_user_message(messages, "¿Cuántos números primos hay entre 1 y 50?")

response = chat(messages, thinking=True, thinking_budget=2000)
add_assistant_message(messages, response)

thinking_block = next((block for block in response.content if block.type == "thinking"), None)
if thinking_block:
    print("Razonamiento:", thinking_block.thinking)

final_text = "".join(block.text for block in response.content if block.type == "text")
print(final_text)
# endregion
