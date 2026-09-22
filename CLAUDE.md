# Calendar AI Agent

AI-powered calendar management agent. Users communicate via messaging platforms (Telegram), agent manages their calendar (Google Calendar) through natural language.

## Tech Stack

- **Language:** TypeScript (Node.js 22)
- **LLM:** Claude API (`@anthropic-ai/sdk`) or OpenAI (`openai`) behind a provider-neutral interface
- **Messaging:** Telegram Bot API via `grammy`
- **Calendar:** Google Calendar API via `googleapis`
- **Build:** tsx (dev), tsup (prod)
- **Storage:** SQLite (`node:sqlite`) for conversation history and notes
- **Deploy:** Docker on a VPS
- **Package manager:** pnpm

## Features

- Calendar management by natural language (Google Calendar)
- Single user (Telegram allow-list), configurable conversation language (default Ukrainian)
- Reminders: weekly summary, daily summary, and a configurable lead-time reminder before each timed event
- Configurable first day of the week and old-events handling (keep/delete)
- Conversation history kept for N days (configurable), `/clear` resets it
- Notes/reminders by context ("buy in market"); agent recalls them on request and removes done items
- Warns the user when Anthropic credits run out
- Docker deployment

## Architecture

- **Tool-use agent pattern:** LLM decides which calendar tools to call
- **Provider pattern:** Calendar and messaging behind interfaces for extensibility
- **Modules:** agent logic / LLM interaction / calendar provider / messaging provider

## Project Structure

```text
src/
  agent/         — core agent logic, tool definitions, conversation loop
  llm/           — LLM provider interface + Anthropic implementation
  calendar/      — calendar provider interface + implementations
  messaging/     — messaging provider interface + implementations
  notes/         — notes provider interface + SQLite implementation
  memory/        — conversation history storage
  db/            — SQLite connection and schema
  scheduler/     — summaries, event reminders, old-events cleanup
  config/        — environment config
  index.ts       — entry point
```

## Commands

- `pnpm dev` — run in development mode
- `pnpm build` — build for production
- `pnpm start` — run production build

## Code Style

- Strict TypeScript, no `any`
- ESM modules
- Interfaces for provider abstractions
- Zod for runtime validation

