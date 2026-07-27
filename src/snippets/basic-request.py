# Basic request example — equivalent to the fetch logic in Chatbot.jsx
#
# Scope note: this mirrors exactly what Chatbot.jsx does in this phase (a
# plain user/assistant round trip, no system prompt, no tools, no thinking).
# The chat() helper below supports those extra features because it is taken
# as-is from the more mature version in "06 Claude tools/005_caching.ipynb",
# but it is called here with only `messages`, matching the JSX scope.

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
# Matches the scope of Chatbot.jsx (Fase 1): no system prompt, no tools,
# no thinking. Those parameters are simply not passed.
messages = []
add_user_message(messages, "Hello, Claude!")

response = chat(messages)
add_assistant_message(messages, response)

print(response.content[0].text)
# endregion


# region: Modo "solo código" (prefill + stop_sequences)
# Truco para que Claude devuelva SOLO código, sin explicación alrededor:
# se "prellena" el turno del assistant con la apertura de un bloque de
# código, y se corta la generación apenas aparece el cierre ```.
messages = []
add_user_message(messages, "Generate a very short EventBridge rule as json")
add_assistant_message(messages, "```json")

code_only_response = chat(messages, stop_sequences=["```"])
print(code_only_response.content[0].text)
# endregion
