import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    telegram_user_id INTEGER PRIMARY KEY,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id  INTEGER NOT NULL REFERENCES users (telegram_user_id),
    -- The LLM conversation role ("user" | "assistant"), unrelated to any user permission.
    role              TEXT    NOT NULL,
    content           TEXT    NOT NULL,
    created_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_user_created_at ON messages (telegram_user_id, created_at);

  -- One JSON blob per user (name, language, timezone, reminders, provider choices, ...).
  -- Missing fields are backfilled by zod defaults on read, so new settings never need a migration.
  CREATE TABLE IF NOT EXISTS user_settings (
    telegram_user_id  INTEGER PRIMARY KEY REFERENCES users (telegram_user_id),
    settings          TEXT    NOT NULL,
    updated_at        INTEGER NOT NULL
  );

  -- "context" is a free-form label such as a place or topic ("market").
  CREATE TABLE IF NOT EXISTS notes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id  INTEGER NOT NULL REFERENCES users (telegram_user_id),
    text              TEXT    NOT NULL,
    context           TEXT,
    created_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes (telegram_user_id, id);

  -- AES-256-GCM ciphertext of a provider's credential fields (e.g. a Google refresh token).
  CREATE TABLE IF NOT EXISTS user_secrets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id  INTEGER NOT NULL REFERENCES users (telegram_user_id),
    kind              TEXT    NOT NULL,
    provider          TEXT    NOT NULL,
    ciphertext        TEXT    NOT NULL,
    iv                TEXT    NOT NULL,
    auth_tag          TEXT    NOT NULL,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    UNIQUE (telegram_user_id, kind, provider)
  );
`;

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "agent.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  return db;
}

