import type { DatabaseSync } from "node:sqlite";

export const MAX_ACTIVITY_SUMMARY_LENGTH = 1000;

export interface ActivityMemoryStore {
  get(userId: number): string | null;
  // Replaces the whole summary; text beyond MAX_ACTIVITY_SUMMARY_LENGTH is cut off.
  set(userId: number, summary: string): void;
  clear(userId: number): void;
}

interface ActivityRow {
  summary: string;
}

// WARNING: experimental. Holds personal data derived from events and notes; gated by SUGGESTIONS_ENABLED.
export class SqliteActivityMemoryStore implements ActivityMemoryStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: number): string | null {
    const row = this.db
      .prepare("SELECT summary FROM user_activity WHERE telegram_user_id = ?")
      .get(userId) as ActivityRow | undefined;

    return row?.summary ?? null;
  }

  set(userId: number, summary: string): void {
    const trimmed = summary.trim().slice(0, MAX_ACTIVITY_SUMMARY_LENGTH);
    if (!trimmed) {
      this.clear(userId);

      return;
    }

    this.db
      .prepare(
        `INSERT INTO user_activity (telegram_user_id, summary, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(telegram_user_id) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at`,
      )
      .run(userId, trimmed, Date.now());
  }

  clear(userId: number): void {
    this.db.prepare("DELETE FROM user_activity WHERE telegram_user_id = ?").run(userId);
  }
}

