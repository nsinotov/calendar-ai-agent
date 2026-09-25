import type { DatabaseSync } from "node:sqlite";

// Remembers which scheduler messages were already sent, so a restart or a repeated tick never sends twice.
export interface SentStore {
  has(userId: number, key: string): boolean;
  // `at` defaults to the current time.
  mark(userId: number, key: string, at?: number): void;
  // When the key was first marked (epoch ms), or null.
  sentAt(userId: number, key: string): number | null;
  pruneOlderThan(timestamp: number): void;
}

export class SqliteSentStore implements SentStore {
  constructor(private readonly db: DatabaseSync) {}

  has(userId: number, key: string): boolean {
    return this.db.prepare("SELECT 1 FROM sent_notifications WHERE telegram_user_id = ? AND key = ?").get(userId, key) !== undefined;
  }

  mark(userId: number, key: string, at: number = Date.now()): void {
    this.db
      .prepare("INSERT OR IGNORE INTO sent_notifications (telegram_user_id, key, sent_at) VALUES (?, ?, ?)")
      .run(userId, key, at);
  }

  sentAt(userId: number, key: string): number | null {
    const row = this.db
      .prepare("SELECT sent_at FROM sent_notifications WHERE telegram_user_id = ? AND key = ?")
      .get(userId, key) as { sent_at: number } | undefined;

    return row ? row.sent_at : null;
  }

  pruneOlderThan(timestamp: number): void {
    this.db.prepare("DELETE FROM sent_notifications WHERE sent_at < ?").run(timestamp);
  }
}

