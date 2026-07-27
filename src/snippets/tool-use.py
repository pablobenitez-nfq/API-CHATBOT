# Tool use example — loop local de tool use pidiendo la hora actual.
#
# Scope note: reusa el mismo chat()/add_user_message/add_assistant_message
# que basic-request.py (ya soporta el parámetro tools=, tomado de la versión
# más pulida en "06 Claude tools/005_caching.ipynb"), y suma la definición
# de la tool get_current_datetime, su ejecución local, y el loop completo:
# llamar a la API con tools=, revisar si stop_reason es "tool_use", ejecutar
# la tool, agregar el tool_result, y volver a llamar hasta que stop_reason
# sea distinto de "tool_use".

# region: Imports y configuración del cliente
from datetime import datetime

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


# region: Definición de la tool get_current_datetime
# Equivalente en Python a TOOL_DEFINITION de src/features/toolUse.js: sin
# parámetros requeridos, alcanza para este caso de uso.
get_current_datetime_schema = {
    "name": "get_current_datetime",
    "description": (
        "Devuelve la fecha y hora actual del sistema, como texto legible. "
        "Usar cuando el usuario pregunte qué hora o fecha es ahora mismo."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}


def execute_tool(name, tool_input):
    if name == "get_current_datetime":
        return str(datetime.now())
    raise ValueError(f"Tool desconocida: {name}")
# endregion


# region: Loop de tool use
# Reenvía el request mientras la respuesta pida usar una tool
# (stop_reason == "tool_use"): ejecuta la tool localmente y agrega su
# resultado como un turno de usuario con content=[{"type": "tool_result", ...}],
# repitiendo hasta que la API devuelva un stop_reason distinto.
def run_conversation_with_tools(messages, tools):
    response = chat(messages, tools=tools)
    add_assistant_message(messages, response)

    while response.stop_reason == "tool_use":
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result = execute_tool(block.name, block.input)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                }
            )

        add_user_message(messages, tool_results)
        response = chat(messages, tools=tools)
        add_assistant_message(messages, response)

    return response
# endregion


# region: Ejemplo de uso
messages = []
add_user_message(messages, "¿Qué hora es ahora mismo?")

final_response = run_conversation_with_tools(messages, tools=[get_current_datetime_schema])
print(final_response.content[0].text)
# endregion
