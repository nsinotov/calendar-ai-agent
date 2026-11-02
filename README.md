# Calendar AI Agent

[![CI](https://github.com/nsinotov/calendar-ai-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/nsinotov/calendar-ai-agent/actions/workflows/ci.yml)

A Telegram assistant that manages Google Calendar and a personal notes list through natural language, powered by Anthropic or OpenAI models.

## Why

I built it for my family. Each of us manages their own calendar by writing to a chat in plain language, without opening a calendar app or thinking about how an event gets created. "Dentist on Friday at 3, remind me an hour before" is enough.

## Demo

<!-- TODO: add a demo (GIF or screenshots of a chat) -->

_Coming soon._

## Features

### Calendar and reminders

- Create, update, delete and search events by chatting, including bulk removal of old events
- Weekly and daily summaries, and a reminder before each timed event, with a custom lead time per event
- Missed reminders are still sent before the event starts, with an apology
- Optional automatic daily deletion of past events

### Notes and personalization

- Notes grouped by context ("buy in the market"), recalled and cleared on request
- Step-by-step onboarding; every setting can be viewed and changed by chat
- Standing preferences ("delete without asking") are remembered until revoked
- Each user chooses the conversation language; "What can you do?" is answered from the registered tools
- Focused on calendar, notes and reminders; other topics are declined unless allowed with `ALLOWED_TOPICS`

### Users and operations

- One bot for several people, each with their own calendar, settings and notes
- Unregistered senders are rejected without calling the LLM
- Admins get low-balance warnings and error alerts, and check or set the balance with `/balance` and `/setbalance`
- Conversation history with configurable retention; `/clear` resets it
- Experimental activity memory and follow-up suggestions (`SUGGESTIONS_ENABLED`, off by default)
- Docker deployment with long polling or a Telegram webhook behind Caddy

## Tech stack

TypeScript, Node.js 22, [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [OpenAI SDK](https://github.com/openai/openai-node), [grammY](https://grammy.dev), [googleapis](https://github.com/googleapis/google-api-nodejs-client), SQLite (`node:sqlite`), Zod, tsup, pnpm, Docker.

## Architecture

Tool-use agent: the LLM decides which calendar, notes, preferences and settings tools to call. LLM, calendar, messaging, notes, logging and storage each sit behind an interface with a factory in the module's `index.ts`, so a new provider (another LLM, calendar, messenger or database) plugs in without touching the agent.

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

## Setup

Requires Node.js 22.13+ (for `node:sqlite`) and pnpm.

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather).
2. Create Google OAuth credentials (Desktop app) with the Calendar API enabled.
3. Copy `.env.example` to `.env` and fill it in. Generate the secrets key with `openssl rand -hex 32` and set it as `SECRETS_ENCRYPTION_KEY`.
4. Install dependencies and register each user (at least one admin):

   ```bash
   pnpm install
   pnpm add-user
   ```

   `add-user` asks for the Telegram user ID, role, profile settings and calendar credentials; for Google, a refresh token (see [Getting a Google refresh token](docs/google-oauth.md)). Secrets are stored encrypted.

5. Run the bot:

   ```bash
   pnpm dev
   ```

## Deployment

Long polling (no public URL needed):

```bash
docker compose up -d --build
```

Telegram webhook behind Caddy (automatic HTTPS): point a domain at the server and set these in `.env`:

```dotenv
DOMAIN=bot.example.com
TELEGRAM_WEBHOOK_URL=https://bot.example.com/telegram
TELEGRAM_WEBHOOK_SECRET=<random string, 16+ characters>
PRIVACY_CONTACT_EMAIL=you@example.com
```

Then start it with the `webhook` profile. Caddy also serves a homepage and the `/privacy` page that the Google OAuth consent screen links to.

```bash
docker compose --profile webhook up -d --build
```

### Behind an existing reverse proxy

If another proxy (e.g. host nginx) already owns ports 80/443 and handles TLS, run Caddy on plain HTTP on a local port by setting this in `.env`:

```dotenv
CADDY_HTTP_PORT=127.0.0.1:8080
CADDY_HTTPS_PORT=127.0.0.1:8443
CADDY_SITE_ADDRESS=http://bot.example.com
```

`CADDY_SITE_ADDRESS` must be `http://` plus your `DOMAIN`, so Caddy serves plain HTTP; `CADDY_HTTPS_PORT` is unused but must not clash with the proxy on 443. Then point the proxy for `DOMAIN` at `http://127.0.0.1:8080`, keeping the `Host` header.

### Data and admin scripts

The database lives in the `agent-data` volume and starts empty; it does not reuse a local `./data`. Register users (at least one admin) and run the other admin scripts inside the container. Keep `SECRETS_ENCRYPTION_KEY` unchanged afterwards, or stored credentials can't be decrypted:

```bash
docker compose exec agent node dist/scripts/add-user.js
docker compose exec agent node dist/scripts/set-balance.js 20
```

## Scripts

- `pnpm dev`: run in development mode
- `pnpm build`: build for production
- `pnpm start`: run the production build
- `pnpm add-user`: register a user with a role and their credentials (in Docker, see [Data and admin scripts](#data-and-admin-scripts))
- `pnpm set-balance <usd>`: set the tracked LLM balance after a top-up (in Docker, see [Data and admin scripts](#data-and-admin-scripts))
- `pnpm typecheck`: type-check the project
- `pnpm lint`: lint the project (ESLint)
- `pnpm format`: format the project (Prettier); `pnpm format:check` only checks
- `pnpm test`: run the tests; `pnpm test:coverage` also prints a coverage report

## Design decisions and trade-offs

- **The LLM picks tools; code validates them.** There is no intent parser: the model chooses among calendar, notes, settings and preferences tools. Every tool input is checked with Zod, and tool errors go back to the model so it can correct itself or explain the problem.
- **Secrets never pass through the chat.** Users and their Google credentials are added only with a server CLI. Refresh tokens are encrypted per user with AES-256-GCM, and they never reach the LLM, the history or the logs.
- **No LLM for strangers or when credits run out.** Unregistered Telegram IDs get a static reply from plain code and are then ignored, so they cost nothing. When the LLM provider is out of credits, users get a static status reply without an LLM call; other LLM failures end in a static error message.
- **One shared LLM key with local spend tracking.** Whoever runs the bot pays for everyone. Spend is estimated from token usage to warn admins early, but the provider's "out of credits" error is the source of truth. While credits are out, one request every 5 minutes gets through as a probe, so the bot recovers by itself.
- **Tool results expire faster than the chat.** Calendar dumps made up about 94% of the stored context and were resent on every turn. They are replaced by a short "stale" notice after an hour by default (`TOOL_RESULT_RETENTION_MINUTES`), while the conversation text is kept for days. The agent can explain both limits to the user.
- **Settings are one JSON blob per user**, validated by Zod with a default for every field, so adding a setting needs no migration. The trade-off: settings can't be queried or constrained per field in SQL.
- **Polling instead of calendar push notifications.** The scheduler refreshes a per-user calendar cache every few minutes, so no public endpoint is needed for Google. The trade-off: a deleted or moved event can still trigger one reminder before the next poll.
- **Reminders survive downtime.** A reminder missed during a restart is still sent before the event starts, with an apology. A missed summary is still sent if the bot is back within 2 hours of its scheduled time.
- **Provider knowledge stays in the provider.** For example, Google's birthday events can't be deleted; only the Google provider knows that (`canDelete()`), and bulk cleanup skips such events instead of failing.
- **Notes live in SQLite**, because Google Keep has no personal API. SQLite (`node:sqlite`) keeps the deployment to one container with no database server, which fits a family-sized bot.
- **Risky actions are guarded in the prompt.** Bulk deletions need confirmation, and event titles and notes are declared as data, not instructions.
- **Privacy-sensitive features are opt-in.** Activity memory and suggestions send events and notes to the LLM daily, so they are behind `SUGGESTIONS_ENABLED`, off by default.

## Testing

Unit tests use `node:test` (`pnpm test`) and sit next to the code as `*.test.ts`. They make no network calls: stores run against in-memory SQLite, providers against fake SDK clients, and the message handler and scheduler against fake messaging, LLM and calendar providers with an injectable clock. Every multi-user store has a test that one user can't see another user's data. An end-to-end test (`src/app/message-flow.e2e.test.ts`) wires the real handler, agent, tools, storage and billing as in production and drives them with a scripted LLM, an in-memory calendar and a fake messenger. `pnpm test:coverage` adds Node's built-in coverage report. CI runs the format check, linter, type check, tests and build on every push to `main` and every pull request against it.

Not covered automatically: the Telegram webhook server and long polling, and real Google and LLM calls.

## Known limitations

- No database migrations: a new column needs a manual change to an existing database.
- Static replies (not registered, out of credits, errors) and admin messages are English only, since the LLM may be unavailable to translate them.
- A reminder lead time over 48 hours is not honoured, because the reminder job only looks 48 hours ahead.
- The spend estimate ignores prompt-cache discounts.
- Tool calls from one model turn run in parallel; dependent calls (e.g. create an event, then update it) rely on the model making them in separate turns.

## Built with Claude Code

The code was written with [Claude Code](https://claude.com/claude-code), Anthropic's coding agent; commits carry a `Co-Authored-By: Claude` trailer.

Claude wrote the code in small steps. I set the requirements, made the product and architecture decisions, reviewed and approved every change and commit, and tested the bot with real Telegram, Google Calendar and LLM accounts.

The code style rules the agent follows are in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE)
