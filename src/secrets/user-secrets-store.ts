import type { DatabaseSync } from "node:sqlite";
import { decrypt, encrypt } from "./crypto.js";

export type SecretKind = "calendar";

export interface UserSecretsStore {
  get(userId: number, kind: SecretKind, provider: string): Record<string, string> | null;
  set(userId: number, kind: SecretKind, provider: string, credentials: Record<string, string>): void;
  // Which providers of this kind are already registered for this user, e.g. to
  // offer as choices during onboarding without asking the user to type one.
  listProviders(userId: number, kind: SecretKind): string[];
  remove(userId: number, kind: SecretKind, provider: string): void;
}

interface SecretRow {
  provider: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

export class SqliteUserSecretsStore implements UserSecretsStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly encryptionKey: Buffer,
  ) {}

  get(userId: number, kind: SecretKind, provider: string): Record<string, string> | null {
    const row = this.db
      .prepare(
        "SELECT provider, ciphertext, iv, auth_tag FROM user_secrets WHERE telegram_user_id = ? AND kind = ? AND provider = ?",
      )
      .get(userId, kind, provider) as SecretRow | undefined;

    if (!row) {
      return null;
    }

    const plaintext = decrypt(
      { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag },
      this.encryptionKey,
    );

    return JSON.parse(plaintext) as Record<string, string>;
  }

  set(userId: number, kind: SecretKind, provider: string, credentials: Record<string, string>): void {
    const encrypted = encrypt(JSON.stringify(credentials), this.encryptionKey);
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO user_secrets (telegram_user_id, kind, provider, ciphertext, iv, auth_tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(telegram_user_id, kind, provider) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           iv = excluded.iv,
           auth_tag = excluded.auth_tag,
           updated_at = excluded.updated_at`,
      )
      .run(userId, kind, provider, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, now);
  }

  listProviders(userId: number, kind: SecretKind): string[] {
    const rows = this.db
      .prepare("SELECT provider FROM user_secrets WHERE telegram_user_id = ? AND kind = ?")
      .all(userId, kind) as unknown as { provider: string }[];

    return rows.map((row) => row.provider);
  }

  remove(userId: number, kind: SecretKind, provider: string): void {
    this.db
      .prepare("DELETE FROM user_secrets WHERE telegram_user_id = ? AND kind = ? AND provider = ?")
      .run(userId, kind, provider);
  }
}

