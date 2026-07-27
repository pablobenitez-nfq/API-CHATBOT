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

## What's next

- **Fase 2**: tool use, native web search, extended thinking, image/PDF
  upload with citations — each as its own toggle in the chat, with its own
  snippet in the code panel.
- **Fase 3**: a prompt-evaluation playground.

Both phases will get their own SDD cycle (spec/design/tasks) when addressed.
