# Calendar AI Agent

AI-powered calendar management agent. Users communicate via messaging platforms (Telegram), agent manages their calendar (Google Calendar) through natural language.

## Tech Stack

- **Language:** TypeScript (Node.js 22)
- **LLM:** Claude API (`@anthropic-ai/sdk`) or OpenAI (`openai`) behind a provider-neutral interface
- **Messaging:** Telegram Bot API via `grammy`
- **Calendar:** Google Calendar API via `googleapis`
- **Build:** tsx (dev), tsup (prod)
- **Storage:** SQLite (`node:sqlite`) for users, settings, encrypted credentials, conversation history, notes, preferences and activity memory
- **Deploy:** Docker on a VPS
- **Package manager:** pnpm

## Features

- Calendar management by natural language (Google Calendar), including bulk removal of old events
- Multi-user (shared bot, per-user settings and encrypted calendar credentials in SQLite), configurable conversation language (default Ukrainian)
- Reminders: weekly summary, daily summary (a "nothing planned" message on empty days), and a configurable lead-time reminder before each timed event, with an optional per-event lead time; a missed reminder is sent late with an apology until the event starts
- Configurable first day of the week and old-events handling (keep/delete)
- Conversation history kept for N days (configurable per user, default from env); tool/calendar data within it goes stale after a separate configurable window (`TOOL_RESULT_RETENTION_MINUTES`) to cap token cost — the agent explains both limits if asked. `/clear` resets the history
- Notes/reminders by context ("buy in market"); agent recalls them on request and removes done items, or clears all
- Onboarding: agent asks the name and walks through settings step by step (skippable, defaults confirmed); settings viewable/changeable by chat
- User preferences memory: standing behaviour instructions stored per user in English, injected into the system prompt; a revoking request removes the old instruction
- Capabilities tool: agent describes what it can do, generated from registered tools
- Scope restriction: only calendar/notes/reminders; off-topic requests declined by the model; extra topics via `ALLOWED_TOPICS`
- Access control: unregistered Telegram IDs rejected without the LLM (static reply), repeat senders ignored
- Experimental (env flag `SUGGESTIONS_ENABLED`, off by default): short rewritten activity memory from events and notes, LLM follow-up suggestions on request and in summaries; handles sensitive data
- Shared LLM balance: low-balance warning goes to admins only; when the LLM reports no credits, all users get one broadcast and a static status reply (no LLM) to each message until it recovers
- Roles: `admin` | `user`; admins are normal users who also get low-balance warnings and system-error alerts in Telegram, and can use `/balance` and `/setbalance <usd>` (chat commands defined in one command registry, shared with the capabilities tool). Adding users and editing secrets is CLI-only
- Docker deployment

## Architecture

- **Tool-use agent pattern:** LLM decides which calendar, notes, preferences and settings tools to call
- **Provider pattern:** LLM, calendar, messaging, storage and logging sit behind interfaces with a factory each; the provider is an identifier (env or per-user setting)
- **Modules:** app (message handling) / agent / LLM / calendar / messaging / storage stores / billing / scheduler

## Project Structure

```text
src/
  app/           — message handling, access control, per-user agent context
  billing/       — LLM spend tracking, balance warnings, out-of-credits handling
  agent/         — core agent logic, tool definitions, conversation loop, system prompt, onboarding, suggestions
  llm/           — LLM provider interface + Anthropic and OpenAI implementations
  logging/       — logger, console/file log providers, admin error alerts
  calendar/      — calendar provider interface + Google implementation
  messaging/     — messaging provider interface + implementations
  notes/         — notes provider interface + SQLite implementation
  memory/        — conversation history, per-user settings, preferences, activity memory, event reminders, sent-message marks
  db/            — SQLite connection, schema and the storage factory
  secrets/       — encryption and per-user credential storage
  scripts/       — admin CLI (`pnpm add-user`, `pnpm set-balance`)
  scheduler/     — summaries, event reminders, old-events cleanup
  config/        — environment config
  index.ts       — entry point
```

## Commands

- `pnpm dev` — run in development mode
- `pnpm test` — run unit tests (`node:test`)
- `pnpm typecheck` — type-check the project
- `pnpm add-user` — register a user with a role and their credentials (run on the server)
- `pnpm set-balance <usd>` — set the tracked LLM balance after a top-up (run on the server)
- `pnpm build` — build for production
- `pnpm start` — run production build

## Code Style

- Blank line above a `return` or a loop (`for`/`while`) if other code precedes it in the same block; skip the blank line when it's the first statement in the block
- Blank line above a comment that starts a new conceptual block within a function
- Never more than one consecutive blank line; if one is already there, don't add another
- No obvious comments; add one only when the meaning isn't readable from the code or is implicit
- Strict TypeScript, no `any`
- ESM modules
- Interfaces for provider abstractions; factories take `provider: string`, switch on it with a `default` that throws, and provider names appear nowhere outside their factory
- Zod for runtime validation

