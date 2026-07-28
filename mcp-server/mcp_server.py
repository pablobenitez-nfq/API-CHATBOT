"""MCP server (Streamable HTTP) for proyecto_react — Fase 3.

Adapted with full fidelity from `07 MCP/cli_project_COMPLETE/mcp_server.py`
(read-only reference source, never modified). Both tools, both resources,
the `format` prompt, and the full `docs` dict (6 entries) are unchanged from
the original.

The ONLY functional change vs. the original: the original ran over stdio
(`mcp.run(transport="stdio")`), which only works for a locally-spawned
child process. This server is consumed by a browser SPA
(`proyecto_react/src/features/mcp.js`) over the network, so it runs on
Streamable HTTP instead, with CORS enabled for the Vite dev server origin.
See the comment block near `if __name__ == "__main__":` below for exactly
which parts of the streamable-http/CORS API were verified, how, and why the
server is NOT started via `mcp.run(transport="streamable-http")`.
"""

from mcp.server.fastmcp import FastMCP
from pydantic import Field
from mcp.server.fastmcp.prompts import base

# host/port set explicitly on construction (Fase 3 requirement); everything
# else about this FastMCP instance is identical to the original.
mcp = FastMCP("DocumentMCP", log_level="ERROR", host="127.0.0.1", port=8000)


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


@mcp.resource("docs://documents", mime_type="application/json")
def list_docs() -> list[str]:
    return list(docs.keys())


@mcp.resource("docs://documents/{doc_id}", mime_type="text/plain")
def fetch_doc(doc_id: str) -> str:
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")
    return docs[doc_id]


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


if __name__ == "__main__":
    # --- Streamable HTTP + CORS: verified decisions (sdd-apply, Phase 1) ---
    #
    # Verified against `modelcontextprotocol/python-sdk` tag `v1.28.1`
    # (source read directly from GitHub during this apply step), which is
    # the latest version published on PyPI as `mcp` — i.e. what an unpinned
    # `pip install mcp` from this folder's requirements.txt actually
    # resolves to right now. File checked:
    # https://github.com/modelcontextprotocol/python-sdk/blob/v1.28.1/src/mcp/server/fastmcp/server.py
    #
    # NOTE: the SDK's `main` branch on GitHub has since been restructured
    # into an unreleased v2 (module renamed from `mcp.server.fastmcp` to
    # `mcp.server.mcpserver`, no `FastMCP` symbol at that path anymore).
    # That is NOT what `pip install mcp` installs today, so this file
    # intentionally targets the v1.28.1 API, matching the original course
    # server's `from mcp.server.fastmcp import FastMCP` import.
    #
    # CONFIRMED (not guessed) against v1.28.1's `FastMCP` class:
    #   - `FastMCP(...)` accepts `host` and `port` keyword args directly in
    #     its constructor (defaults "127.0.0.1" / 8000), stored on
    #     `mcp.settings.host` / `mcp.settings.port`.
    #   - `FastMCP.streamable_http_app()` returns a Starlette ASGI app
    #     mounted at `mcp.settings.streamable_http_path` (default "/mcp"),
    #     obtainable independently of `.run()`.
    #   - There is NO native `cors_origins=` kwarg anywhere in
    #     `FastMCP.__init__` or its `Settings` model — CORS is not a
    #     documented/first-class FastMCP option in this version. Wrapping
    #     the ASGI app with Starlette's own `CORSMiddleware` (below) is not
    #     a fallback choice, it is the only supported way to add CORS here.
    #   - `mcp.run(transport="streamable-http")` internally does exactly
    #     `streamable_http_app()` + `uvicorn.Config` + `uvicorn.Server`, but
    #     does not expose a hook to inject middleware — that's why this
    #     file does NOT call `mcp.run(...)` and instead reproduces the same
    #     host/port/transport behavior manually so `CORSMiddleware` can be
    #     inserted around the app before uvicorn serves it.
    #
    # If a future `mcp` release changes this API, the two things to check
    # first are `FastMCP.streamable_http_app()` and `FastMCP.settings`.
    import uvicorn
    from starlette.middleware.cors import CORSMiddleware

    # `expose_headers` es imprescindible: el protocolo MCP Streamable HTTP
    # asigna el ID de sesión devolviéndolo en el header de respuesta
    # `Mcp-Session-Id` del `initialize`, y el cliente debe reenviarlo en cada
    # request posterior. Por default, CORS oculta headers custom del lado
    # JS del navegador salvo que se expongan explícitamente acá — sin esto,
    # `curl` (que ignora CORS) funciona perfecto, pero un cliente real en el
    # browser nunca llega a leer el header y falla con "Missing session ID"
    # en el segundo request. Bug real encontrado probando el toggle "Usar
    # MCP" desde el chatbot de verdad, no visible con curl.
    app = mcp.streamable_http_app()
    app = CORSMiddleware(
        app,
        allow_origins=["http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["mcp-session-id"],
    )

    # Port 8000 is FastMCP's own default (see `host`/`port` above) — kept
    # as-is per design.md; change here (and in
    # `src/features/mcp.js`'s server URL constant) if 8000 collides with
    # something else running locally.
    uvicorn.run(app, host=mcp.settings.host, port=mcp.settings.port)
