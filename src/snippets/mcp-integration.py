# MCP integration example — vidriera educativa de "07 MCP/cli_project_COMPLETE/",
# NO ejecutable desde este chatbot (browser). Muestra, con extractos fieles
# de las fuentes reales del curso, cómo una tool definida en un servidor MCP
# (mcp_server.py) llega a un cliente MCP vía stdio (mcp_client.py) y termina
# convertida al mismo shape {name, description, input_schema} que ya usa
# TOOL_DEFINITION en src/features/toolUse.js (core/tools.py).
#
# Scope note: reusa el mismo chat()/add_user_message/add_assistant_message
# que tool-use.py/web-search.py. Recortado a UNA tool de ejemplo
# (read_doc_contents): se excluyen edit_document, @mcp.resource y
# @mcp.prompt del servidor real, y list_prompts/get_prompt/read_resource/
# cleanup del cliente real — el foco es exclusivamente tool use vía MCP.

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


# region: Definición de la tool en el servidor MCP
# Extracto de 07 MCP/cli_project_COMPLETE/mcp_server.py, recortado a UNA
# tool (read_doc_contents) y a un subset de 3 documentos de ejemplo (el
# dict `docs` real tiene 6 entradas). Se excluyen explícitamente
# edit_document (segunda tool del server real), y por completo los dos
# @mcp.resource y el @mcp.prompt — este snippet cubre solo tool use.
from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("DocumentMCP", log_level="ERROR")

docs = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
}


@mcp.tool(
    name="read_doc_contents",
    description="Read the contents of a document and return it as a string.",
)
def read_document(doc_id: str = Field(description="Id of the document to read")):
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")
    return docs[doc_id]
# endregion


# region: Conexión del cliente MCP vía stdio
# Extracto de 07 MCP/cli_project_COMPLETE/mcp_client.py, recortado a lo
# esencial para tool use: __init__, connect() (spawnea el servidor como
# proceso hijo del SO vía stdio), list_tools() y call_tool(). Se excluyen
# list_prompts, get_prompt y read_resource (no usados en el ejemplo de
# abajo). cleanup()/__aenter__()/__aexit__() SÍ se incluyen, recortados
# pero fieles a la fuente real: sin ellos, el `async with MCPClient(...)`
# del ejemplo de uso rompería en tiempo de ejecución (Python exige que la
# clase implemente el protocolo de context manager asíncrono).
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client


class MCPClient:
    def __init__(self, command, args, env=None):
        self._command = command
        self._args = args
        self._env = env
        self._session = None
        self._exit_stack = AsyncExitStack()

    async def connect(self):
        server_params = StdioServerParameters(
            command=self._command,
            args=self._args,
            env=self._env,
        )
        stdio_transport = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        _stdio, _write = stdio_transport
        self._session = await self._exit_stack.enter_async_context(
            ClientSession(_stdio, _write)
        )
        await self._session.initialize()

    async def list_tools(self) -> list[types.Tool]:
        result = await self._session.list_tools()
        return result.tools

    async def call_tool(self, tool_name, tool_input):
        return await self._session.call_tool(tool_name, tool_input)

    async def cleanup(self):
        await self._exit_stack.aclose()
        self._session = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.cleanup()
# endregion


# region: De tool MCP a tool de la API de Claude
# Extracto literal de 07 MCP/cli_project_COMPLETE/core/tools.py.
# Punto pedagógico central: el shape {name, description, input_schema} que
# arma acá es EXACTAMENTE el mismo que TOOL_DEFINITION en
# src/features/toolUse.js — la diferencia es que ahí se escribe a mano, y
# acá se descubre en runtime consultando al servidor MCP vía list_tools().
class ToolManager:
    @classmethod
    async def get_all_tools(cls, clients: dict[str, MCPClient]) -> list[dict]:
        """Gets all tools from the provided clients."""
        tools = []
        for client in clients.values():
            tool_models = await client.list_tools()
            tools += [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.inputSchema,
                }
                for t in tool_models
            ]
        return tools
# endregion


# region: Ejemplo de uso
# Flujo end-to-end, paralelo directo del loop de tool-use.py. La diferencia
# clave: execute_tool() (función local) se reemplaza por client.call_tool()
# (llamada MCP al proceso servidor vía stdio) — el resto del loop
# (stop_reason == "tool_use", agregar tool_result, repetir) es idéntico.
#
# `async with`/`await` no son válidos a nivel de módulo en un script .py
# real (a diferencia de un notebook, que sí soporta top-level await) — por
# eso, igual que mcp_client.py, el ejemplo va envuelto en una función
# async y se dispara con asyncio.run(), no ejecutado suelto.
import asyncio


async def main():
    async with MCPClient(command="python", args=["mcp_server.py"]) as client:
        tools = await ToolManager.get_all_tools({"docs": client})

        messages = []
        add_user_message(messages, "¿Qué dice el documento plan.md?")

        response = chat(messages, tools=tools)
        add_assistant_message(messages, response)

        while response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result = await client.call_tool(block.name, block.input)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result.content,
                    }
                )
            add_user_message(messages, tool_results)
            response = chat(messages, tools=tools)
            add_assistant_message(messages, response)

        print(response.content[0].text)


asyncio.run(main())
# endregion
