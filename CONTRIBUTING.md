# Contributing

This is a personal project, but bug reports and small pull requests are welcome. For a larger change, please open an issue first so we can agree on the approach. Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Development

Set up the project as described in [Setup](README.md#setup). Before opening a pull request, make sure all checks pass; CI runs the same ones:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm format` fixes formatting.

## Guidelines

- Follow the code style in [CLAUDE.md](CLAUDE.md).
- Add or update tests with every change. Tests sit next to the code as `*.test.ts` and make no network calls; fake the LLM, calendar and messenger.
- A new LLM, calendar, messenger or storage backend goes behind the existing interface and its factory (see [Architecture](README.md#architecture)); nothing outside the factory should name the provider.
- Keep each commit to one change, with a short message saying what it does, e.g. "Send missed event reminders late with an apology".
- Update the README when behaviour, configuration or commands change.
