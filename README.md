# Calendar AI Agent

A Telegram assistant that manages Google Calendar and a personal notes list through natural language, powered by Claude or OpenAI.

## Features

- Create, update, delete and search calendar events by chatting, including removing all old events in one go
- Notes by context (e.g. "buy in the market"): the agent recalls them on request and removes done items, or clears them all at once
- First-conversation onboarding: the agent asks for your name and walks you through the settings one by one, with answer options; you can skip it and accept the defaults
- Settings by chat: conversation language, timezone, first day of the week, reminders, old-events handling and history retention can be viewed and changed by asking
- Personal preferences: tell the agent how to behave ("delete without asking for confirmation") and it stores that as a standing instruction; revoking it later removes the instruction
- "What can you do?": the agent describes its own abilities and the chat commands available to your role, generated from its registered tools and command registry
- Focused scope: the agent only handles calendar, notes and reminders, and politely declines anything else; extra topics can be allowed with `ALLOWED_TOPICS`
- Experimental, off by default (`SUGGESTIONS_ENABLED`): a short, continuously rewritten memory of your recent activities, and friendly follow-up suggestions on request and in the summaries. It sends your events and notes to the LLM, so enable it deliberately
- Weekly and daily summaries of upcoming events (a "nothing planned" message on empty days), plus a reminder before each timed event; all configurable per user, and a custom lead time can be set for a single event ("remind me 2 hours before"). A reminder that was missed is still sent before the event starts, with an apology
- Optional cleanup of old calendar events
- Conversation history with configurable retention; `/clear` resets it. Calendar/tool data within that history is only trusted for a separate, short configurable window before the agent re-fetches it, to keep token cost down — it explains both limits if you ask what it remembers. Scheduled messages and the `/clear` confirmation are written in your language
- Shared LLM credit tracking: admins are warned when the balance runs low and can check or update the tracked balance with `/balance` and `/setbalance <usd>`; when the LLM runs out of credits, all users get one notice and a short status reply to any message until it recovers
- Admin role: admins are regular users who also receive low-balance warnings and system-error alerts (event name only, deduplicated) in Telegram. Users and secrets are managed only through the server CLI, not through chat
- Provider-agnostic layers: LLM (Anthropic, OpenAI), calendar (Google), messaging (Telegram) and storage (SQLite) each sit behind an interface and a factory; the provider is chosen by an identifier in the config
- Configurable logging: error/warn/info levels, console and file providers, separate debug toggle
- Multi-user: one Telegram bot serves several people, each with their own settings, notes, preferences and encrypted calendar credentials
- Access control: messages from unregistered Telegram IDs are rejected by plain code (no LLM), with a static reply; repeat senders are ignored
- Docker deployment behind a Telegram webhook

## Tech Stack

TypeScript, Node.js 22, [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [OpenAI SDK](https://github.com/openai/openai-node), [grammY](https://grammy.dev), [googleapis](https://github.com/googleapis/google-api-nodejs-client), SQLite (`node:sqlite`), Zod, tsup, pnpm, Docker.

## Architecture

Tool-use agent: the LLM decides which calendar, notes, preferences and settings tools to call. LLM, calendar, messaging, storage and logging sit behind interfaces, so providers can be swapped.

```text
src/
  app/         message handling, access control, per-user agent context
  agent/       agent loop, system prompt, tool definitions, onboarding, suggestions
  billing/     LLM spend tracking, balance warnings, out-of-credits handling
  llm/         LLM provider interface + Anthropic and OpenAI implementations
  calendar/    calendar provider interface + Google implementation
  messaging/   messaging provider interface + Telegram implementation
  notes/       notes provider interface + SQLite implementation
  memory/      conversation history, per-user settings, preferences, activity memory, event reminders, sent-message marks
  db/          SQLite connection, schema and the storage factory
  secrets/     encryption and per-user credential storage
  scripts/     admin CLI (`pnpm add-user`, `pnpm set-balance`)
  logging/     logger, console/file log providers, admin error alerts
  scheduler/   summaries, event reminders, cleanup jobs
  config/      environment config
  index.ts     entry point
```

## Extending

LLM, calendar, messaging, notes, logging and storage all sit behind interfaces with a factory in each module's `index.ts`. New providers (another LLM, calendar, messenger or database) plug in there without touching the agent.

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

Long polling (no public URL needed):

```bash
docker compose up -d --build
```

Telegram webhook behind Caddy (automatic HTTPS): point a domain at the server, set `DOMAIN`, `TELEGRAM_WEBHOOK_URL` (`https://<DOMAIN>/telegram`) and `TELEGRAM_WEBHOOK_SECRET` in `.env`, then:

```bash
docker compose --profile webhook up -d --build
```

### Behind an existing reverse proxy

If another proxy (e.g. host nginx) already owns ports 80/443 and handles TLS, run Caddy on plain HTTP on a local port by setting this in `.env`:

```bash
CADDY_HTTP_PORT=127.0.0.1:8080
CADDY_HTTPS_PORT=127.0.0.1:8443
CADDY_SITE_ADDRESS=http://bot.example.com
```

Then point the proxy for `DOMAIN` at `http://127.0.0.1:8080`, keeping the `Host` header.

The database lives in the `agent-data` volume. The admin scripts run inside the container:

```bash
docker compose exec agent node dist/scripts/add-user.js
docker compose exec agent node dist/scripts/set-balance.js 20
```

## Scripts

- `pnpm dev`: run in development mode
- `pnpm build`: build for production
- `pnpm start`: run the production build
- `pnpm add-user`: register a user with a role and their credentials (run on the server)
- `pnpm set-balance <usd>`: set the tracked LLM balance after a top-up (run on the server)
- `pnpm typecheck`: type-check the project
- `pnpm test`: run unit tests

## License

[MIT](LICENSE)

