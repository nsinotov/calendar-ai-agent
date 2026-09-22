# Calendar AI Agent

A Telegram assistant that manages Google Calendar and a personal notes list through natural language, powered by Claude.

## Features

- Create, update, delete and search calendar events by chatting
- Notes by context (e.g. "buy in the market"): the agent recalls them on request and removes done items
- Configurable conversation language and timezone
- Weekly and daily summaries of upcoming events, plus a reminder before each event (all configurable)
- Optional cleanup of old calendar events
- Conversation history with configurable retention; `/clear` resets it
- Anthropic credit tracking with low-balance and out-of-credits warnings
- Provider-agnostic LLM layer: Anthropic and OpenAI implemented behind one interface
- Provider-agnostic calendar layer: Google Calendar implemented behind the same pattern
- Configurable logging: error/warn/info levels, console and file providers, separate debug toggle
- Multi-user: one Telegram bot serves several people, each with their own settings and calendar credentials
- Single-user access via a Telegram allow-list
- Docker deployment behind a Telegram webhook

## Tech Stack

TypeScript, Node.js 22, [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [grammY](https://grammy.dev), [googleapis](https://github.com/googleapis/google-api-nodejs-client), SQLite (`node:sqlite`), Zod, tsup, pnpm, Docker.

## Architecture

Tool-use agent: Claude decides which calendar and notes tools to call. Calendar, messaging and notes sit behind interfaces, so providers can be swapped.

```text
src/
  agent/       agent loop, system prompt, tool definitions
  llm/         LLM provider interface + Anthropic implementation
  calendar/    calendar provider interface + Google implementation
  messaging/   messaging provider interface + Telegram implementation
  notes/       notes provider interface + SQLite implementation
  memory/      conversation history storage
  db/          SQLite connection and schema
  logging/     logger + console/file log providers
  scheduler/   summaries, event reminders, cleanup jobs
  config/      environment config
  index.ts     entry point
```

## Setup

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and get your Telegram user ID.
2. Create Google OAuth credentials (Desktop app) with the Calendar API enabled.
3. Copy `.env.example` to `.env` and fill it in.
4. Install and run:

```bash
pnpm install
pnpm dev
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
- `pnpm typecheck`: type-check the project
- `pnpm test`: run unit tests

## License

[MIT](LICENSE)

