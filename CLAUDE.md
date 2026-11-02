# Calendar AI Agent

AI-powered calendar management agent. Users communicate via messaging platforms (Telegram), agent manages their calendar (Google Calendar) through natural language.

Features, tech stack, architecture, project structure and commands are described in [README.md](README.md).

## Code Style

- Blank line above a `return` or a loop (`for`/`while`) if other code precedes it in the same block; skip the blank line when it's the first statement in the block
- Blank line above a comment that starts a new conceptual block within a function
- Never more than one consecutive blank line; if one is already there, don't add another
- No obvious comments; add one only when the meaning isn't readable from the code or is implicit
- Strict TypeScript, no `any`
- ESM modules
- Interfaces for provider abstractions; factories take `provider: string` (an identifier from env or a per-user setting), switch on it with a `default` that throws, and provider names appear nowhere outside their factory
- Zod for runtime validation
