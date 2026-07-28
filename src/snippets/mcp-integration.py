# MCP integration example — fidelidad completa a las fuentes reales de
# "07 MCP/cli_project_COMPLETE/" (mcp_server.py + mcp_client.py), curado
# solo en el sentido de reusar el mismo chat()/add_user_message/
# add_assistant_message que tool-use.py/web-search.py en vez de duplicarlos
# con otro nombre. No es un extracto recortado: ambas tools, ambos
# resources, el prompt, y la clase MCPClient completa están todos presentes,
# sin placeholders ni TODOs.
#
# Nota de transporte: esta versión curada usa stdio (StdioServerParameters +
# stdio_client), igual que las fuentes originales del curso — el servidor
# real que corre este chatbot (`proyecto_react/mcp-server/mcp_server.py`)
# usa Streamable HTTP en su lugar (ver src/features/mcp.js, pestaña JSX de
# este mismo panel), porque un SPA en el navegador no puede spawnear un
# proceso hijo por stdio. El código Python del server (tools/resources/
# prompt) es idéntico en ambos casos; lo que cambia es únicamente el
# transporte, documentado en ambos archivos fuente.

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


# region: Servidor MCP — tools
# Extracto literal de 07 MCP/cli_project_COMPLETE/mcp_server.py: las DOS
# tools reales del servidor (read_doc_contents y edit_document), sin
# recortes, sobre el dict `docs` completo (6 entradas).
from mcp.server.fastmcp import FastMCP
from pydantic import Field
from mcp.server.fastmcp.prompts import base

mcp = FastMCP("DocumentMCP", log_level="ERROR")

docs = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "financials.docx": "These financials outline the project's budget and expenditures.",
    "outlook.pdf": "This document presents the projected future performance of the system.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
    "spec.txt": "These specifications define the technical requirements for the equipment.",
}


@mcp.tool(
    name="read_doc_contents",
    description="Read the contents of a document and return it as a string.",
)
def read_document(
    doc_id: str = Field(description="Id of the document to read"),
):
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")

    return docs[doc_id]


@mcp.tool(
    name="edit_document",
    description="Edit a document by replacing a string in the documents content with a new string",
)
def edit_document(
    doc_id: str = Field(description="Id of the document that will be edited"),
    old_str: str = Field(
        description="The text to replace. Must match exactly, including whitespace"
    ),
    new_str: str = Field(
        description="The new text to insert in place of the old text"
    ),
):
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")

    docs[doc_id] = docs[doc_id].replace(old_str, new_str)
# endregion


# region: Servidor MCP — resources
# Extracto literal de 07 MCP/cli_project_COMPLETE/mcp_server.py: los DOS
# resources reales — uno lista los ids de documento (JSON), el otro
# devuelve el contenido de un documento puntual (texto plano), con el doc_id
# interpolado en la URI vía el patrón `{doc_id}` de FastMCP.
@mcp.resource("docs://documents", mime_type="application/json")
def list_docs() -> list[str]:
    return list(docs.keys())


@mcp.resource("docs://documents/{doc_id}", mime_type="text/plain")
def fetch_doc(doc_id: str) -> str:
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")
    return docs[doc_id]
# endregion


# region: Servidor MCP — prompt
# Extracto literal de 07 MCP/cli_project_COMPLETE/mcp_server.py: el prompt
# `format`, un template reutilizable que el servidor ofrece (a diferencia de
# una tool, no lo ejecuta el servidor — el cliente lo pide, arma el mensaje
# resultante, y es el modelo quien decide qué hacer con él, típicamente
# invocando la tool `edit_document`).
@mcp.prompt(
    name="format",
    description="Rewrites the contents of the document in Markdown format.",
)
def format_document(
    doc_id: str = Field(description="Id of the document to format"),
) -> list[base.Message]:
    prompt = f"""
    Your goal is to reformat a document to be written with markdown syntax.

    The id of the document you need to reformat is:
    <document_id>
    {doc_id}
    </document_id>

    Add in headers, bullet points, tables, etc as necessary. Feel free to add in extra text, but don't change the meaning of the report.
    Use the 'edit_document' tool to edit the document. After the document has been edited, respond with the final version of the doc. Don't explain your changes.
    """

    return [base.UserMessage(prompt)]
# endregion


# region: Cliente MCP completo
# Extracto literal de 07 MCP/cli_project_COMPLETE/mcp_client.py: la clase
# MCPClient COMPLETA, sin recortes — connect, list_tools, call_tool,
# list_prompts, get_prompt, read_resource, cleanup, y el ciclo de contexto
# asíncrono __aenter__/__aexit__ (requerido: sin esto, `async with
# MCPClient(...)` en el ejemplo de uso de más abajo falla en tiempo de
# ejecución porque la clase no implementaría el protocolo de context manager
# asíncrono).
import json
from typing import Any, Optional
from contextlib import AsyncExitStack
from pydantic import AnyUrl
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client


class MCPClient:
    def __init__(
        self,
        command: str,
        args: list[str],
        env: Optional[dict] = None,
    ):
        self._command = command
        self._args = args
        self._env = env
        self._session: Optional[ClientSession] = None
        self._exit_stack: AsyncExitStack = AsyncExitStack()

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

    def session(self) -> ClientSession:
        if self._session is None:
            raise ConnectionError(
                "Client session not initialized or cache not populated. Call connect_to_server first."
            )
        return self._session

    async def list_tools(self) -> list[types.Tool]:
        result = await self.session().list_tools()
        return result.tools

    async def call_tool(
        self, tool_name: str, tool_input
    ) -> types.CallToolResult | None:
        return await self.session().call_tool(tool_name, tool_input)

    async def list_prompts(self) -> list[types.Prompt]:
        result = await self.session().list_prompts()
        return result.prompts

    async def get_prompt(self, prompt_name, args: dict[str, str]):
        result = await self.session().get_prompt(prompt_name, args)
        return result.messages

    async def read_resource(self, uri: str) -> Any:
        result = await self.session().read_resource(AnyUrl(uri))
        resource = result.contents[0]

        if isinstance(resource, types.TextResourceContents):
            if resource.mimeType == "application/json":
                return json.loads(resource.text)

            return resource.text

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
# Flujo end-to-end: conecta al servidor MCP real (spawneado como proceso
# hijo vía stdio), descubre sus tools, corre el mismo loop de tool-use.py
# (execute_tool() local se reemplaza por client.call_tool(), una llamada MCP
# real al proceso servidor) y además ejercita resources y el prompt
# `format` — las dos primitivas que tool-use.py no cubre porque no tiene
# noción de servidor MCP.
#
# `async with`/`await` no son válidos a nivel de módulo en un script .py
# real (a diferencia de un notebook, que sí soporta top-level await) — por
# eso, igual que mcp_client.py, el ejemplo va envuelto en una función
# async y se dispara con asyncio.run(), no ejecutado suelto.
import asyncio


async def main():
    async with MCPClient(command="python", args=["mcp_server.py"]) as client:
        tools = await ToolManager.get_all_tools({"docs": client})

        # Resources: listar los ids de documento disponibles, y leer el
        # contenido de uno puntual.
        doc_ids = await client.read_resource("docs://documents")
        first_doc = await client.read_resource(f"docs://documents/{doc_ids[0]}")
        print(f"Documentos disponibles: {doc_ids}")
        print(f"Contenido de {doc_ids[0]}: {first_doc}")

        # Prompt: pedirle al servidor el template `format` para un
        # documento puntual, y usarlo como mensaje inicial del chat.
        prompt_messages = await client.get_prompt("format", {"doc_id": doc_ids[0]})

        messages = []
        add_user_message(messages, prompt_messages[0].content.text)

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
