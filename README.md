# proyecto_react — Standalone Chatbot (React + Vite)

Self-contained chat app that calls the Anthropic Messages API directly from
the browser, with no backend. This is **Fase 1** of a multi-phase project.

## Setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template and set your API key:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set:

   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-...
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

## ⚠️ Security warning

This app sends your Anthropic API key directly from the browser using the
`anthropic-dangerous-direct-browser-access` header. **This pattern is only
safe for local, personal use with your own key.** Never deploy this app
publicly as-is — anyone who opens the deployed page could read your key from
the browser's network requests and use it at your expense. A production
setup needs a backend that keeps the key server-side.

## Ver código

The app has a "Ver código" tab that shows the exact JSX source of
`Chatbot.jsx` (imported live via Vite's `?raw`, so it never drifts from the
running code) next to an equivalent, curated Python snippet.

## Fase 3: servidor MCP

This phase adds a real, live MCP (Model Context Protocol) integration —
a genuine Python server exposing tools/resources/prompts over Streamable
HTTP, and a genuine JS client (`@modelcontextprotocol/sdk`) that talks to
it. This is **not** a static "showcase" snippet: the tools returned by the
server are merged into the live tool-use loop and actually invoked.

### Starting the app (2 processes)

You need two terminals running at the same time:

**Terminal 1 — MCP server (Python):**

```bash
cd mcp-server
pip install -r requirements.txt
python mcp_server.py
```

If `python` is not on your PATH, use the path to your own Python
interpreter instead (e.g. a specific `python.exe`/`python3` install) — the
command above assumes a generic `python` available on PATH.

**Terminal 2 — Vite dev server (JS):**

```bash
npm run dev
```

### Port and CORS

By default the MCP server listens on `http://127.0.0.1:8000/mcp`, and its
CORS policy only allows requests from `http://localhost:5173` (Vite's
default port). If you change the Vite port, you must update the
`allow_origins` list in `mcp-server/mcp_server.py` to match, or the browser
will block the requests.

### Using MCP in the chat

Once both processes are running, check the "Usar MCP (servidor real)"
toggle in the chat UI. This connects a real MCP client and merges the
server's tools into the tool-use loop for that conversation. While the
toggle is active, two extra buttons appear:

- **"Listar recursos MCP"** — reads the `docs://documents` resource from
  the server and pushes the result into the trace panel.
- **"Ver prompt 'format'"** — fetches the `format` prompt from the server
  and pushes it into the trace panel.

If the toggle is on but the server isn't reachable, an amber banner
explains the failure and shows the exact command to start the server.
