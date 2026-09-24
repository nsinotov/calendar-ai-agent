# Calendar AI Agent

A Telegram assistant that manages Google Calendar and a personal notes list through natural language, powered by Claude or OpenAI.

## Features

- Create, update, delete and search calendar events by chatting, including removing all old events in one go
- Notes by context (e.g. "buy in the market"): the agent recalls them on request and removes done items, or clears them all at once
- First-conversation onboarding: the agent asks for your name and walks you through the settings one by one, with answer options; you can skip it and accept the defaults
- Settings by chat: conversation language, timezone, first day of the week, reminders, old-events handling and history retention can be viewed and changed by asking
- Personal preferences: tell the agent how to behave ("delete without asking for confirmation") and it stores that as a standing instruction; revoking it later removes the instruction
- "What can you do?": the agent describes its own abilities, generated from its registered tools
- Focused scope: the agent only handles calendar, notes and reminders, and politely declines anything else; extra topics can be allowed with `ALLOWED_TOPICS`
- Experimental, off by default (`SUGGESTIONS_ENABLED`): a short, continuously rewritten memory of your recent activities, and friendly follow-up suggestions on request and in the summaries. It sends your events and notes to the LLM, so enable it deliberately
- Weekly and daily summaries of upcoming events, plus a reminder before each event (all configurable)
- Optional cleanup of old calendar events
- Conversation history with configurable retention; `/clear` resets it
- Shared LLM credit tracking: admins are warned when the balance runs low; when the LLM runs out of credits, all users get one notice and a short status reply to any message until it recovers
- Admin role: admins are regular users who also receive low-balance warnings and system errors in Telegram. Users and secrets are managed only through the server CLI, not through chat
- Provider-agnostic LLM layer: Anthropic and OpenAI implemented behind one interface
- Provider-agnostic calendar layer: Google Calendar implemented behind the same pattern
- Configurable logging: error/warn/info levels, console and file providers, separate debug toggle
- Multi-user: one Telegram bot serves several people, each with their own settings, notes, preferences and encrypted calendar credentials
- Access control: messages from unregistered Telegram IDs are rejected by plain code (no LLM), with a static reply; repeat senders are ignored
- Docker deployment behind a Telegram webhook

## Tech Stack

TypeScript, Node.js 22, [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [OpenAI SDK](https://github.com/openai/openai-node), [grammY](https://grammy.dev), [googleapis](https://github.com/googleapis/google-api-nodejs-client), SQLite (`node:sqlite`), Zod, tsup, pnpm, Docker.

## Architecture

Tool-use agent: the LLM decides which calendar, notes, preferences and settings tools to call. Calendar, messaging and notes sit behind interfaces, so providers can be swapped.

```text
src/
  agent/       agent loop, system prompt, tool definitions, onboarding, suggestions
  llm/         LLM provider interface + Anthropic and OpenAI implementations
  calendar/    calendar provider interface + Google implementation
  messaging/   messaging provider interface + Telegram implementation
  notes/       notes provider interface + SQLite implementation
  memory/      conversation history, per-user settings, preferences, activity memory
  db/          SQLite connection and schema
  secrets/     encryption and per-user credential storage
  scripts/     admin CLI (`pnpm add-user`)
  logging/     logger + console/file log providers
  scheduler/   summaries, event reminders, cleanup jobs
  config/      environment config
  index.ts     entry point
```

## Setup

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather).
2. Create Google OAuth credentials (Desktop app) with the Calendar API enabled.
3. Copy `.env.example` to `.env` and fill it in. Generate the secrets key with `openssl rand -hex 32` and set it as `SECRETS_ENCRYPTION_KEY`.
4. Install and run:

```bash
pnpm install
pnpm dev
```

5. Register each user on the server, including at least one with the admin role (Telegram user ID, role, basics and Google refresh token; secrets are stored encrypted):

```bash
pnpm add-user
```

## Deployment

```bash
docker compose up -d --build
```

Set `TELEGRAM_WEBHOOK_URL` to a public HTTPS URL that proxies to the container's `PORT`. Leave it empty to use long polling.

## Scripts

- `pnpm dev`: run in development mode
- `pnpm build`: build for production
- `pnpm start`: run the production build
- `pnpm add-user`: register a user with a role and their credentials (run on the server)
- `pnpm typecheck`: type-check the project
- `pnpm test`: run unit tests

## License

[MIT](LICENSE)

