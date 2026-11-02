# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's [Report a vulnerability](https://github.com/nsinotov/calendar-ai-agent/security/advisories/new) form, not in a public issue. This is a personal project, so there is no guaranteed response time.

## Threat model

The bot is self-hosted for a small, invite-only group, such as a family. One operator runs the server and is trusted: whoever controls the server holds the encryption key and the database, so a server compromise is out of scope.

What needs protecting: each user's Google refresh token (read and write access to their calendar), calendar contents, notes and chat history, and the operator's bot token, LLM API key and LLM budget.

| Threat                                                                              | Mitigation                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A stranger writes to the bot                                                        | Only registered Telegram IDs reach the agent. Others get one static reply from plain code and are then ignored, with no LLM call. Group chats are ignored.                             |
| Forged webhook requests                                                             | Telegram must send the `TELEGRAM_WEBHOOK_SECRET` token with every request; Caddy terminates TLS.                                                                                       |
| One user reaching another user's data                                               | Tools are built per request for the sender only, with their own calendar. Every store method takes the user ID first, and each store has a cross-user isolation test.                  |
| Prompt injection through event titles, descriptions or notes (e.g. a shared invite) | The system prompt declares this content as data, never instructions, and bulk deletions need the user's confirmation. This is not enforced in code; see below.                         |
| A stolen database file or backup                                                    | Refresh tokens are encrypted with AES-256-GCM; the key lives only in `.env`. Notes, settings and history are stored in plain SQLite.                                                   |
| Personal data in logs                                                               | Info logs carry metadata only. Message and event content is logged only at debug level (`DEBUG_ENABLED`, off by default). Admin alerts contain only the log event name and error kind. |
| Secrets in the chat                                                                 | Users and credentials are added only with the server CLI, so tokens never pass through Telegram, the LLM, the history or the logs.                                                     |

Known gaps:

- Prompt-injection defences are prompt-level only. A successful injection can use the tools available to that one user, on that user's calendar and notes; it can't reach other users or the stored secrets. A user can also turn off the deletion confirmation with a standing preference.
- There is no per-user rate limit. A registered user can spend the shared LLM budget; spend is tracked and admins are warned when the balance runs low.
- The Google token uses the full `calendar` scope, because the bot creates, edits and deletes events.

## Data sent to the LLM provider

With every message, the configured provider (Anthropic or OpenAI) receives:

- the system prompt, with the user's name, language, timezone, first day of the week and stored preferences;
- the conversation history within the retention window, including tool calls and results: event titles, times, locations and descriptions, and notes. Tool results older than `TOOL_RESULT_RETENTION_MINUTES` are replaced by a short notice.

Scheduled summaries and reminders, which include event titles and places, are also sent to it for translation unless the user's language is English. With `SUGGESTIONS_ENABLED`, upcoming events and notes are sent daily to rewrite the activity summary, which is then added to the system prompt.

Never sent: refresh tokens, the encryption key, or other users' data. Messages also pass through Telegram.

## Rotating secrets

The bot token, LLM API key, Google client secret and webhook secret can be replaced in `.env` and take effect after a restart.

There is no built-in rotation for `SECRETS_ENCRYPTION_KEY`. Tokens encrypted with the old key can't be decrypted with a new one, and that user's requests fail until they are registered again. To rotate it:

1. Stop the bot and set a new key (`openssl rand -hex 32`) in `.env`.
2. Start the bot and run `add-user` again for each user with a fresh refresh token (see [Getting a Google refresh token](docs/google-oauth.md)). Re-enter the same answers for the other questions, because they overwrite the user's settings.

If the key or the database may have leaked, also revoke the users' tokens at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) or reset the OAuth client secret in Google Cloud Console.
