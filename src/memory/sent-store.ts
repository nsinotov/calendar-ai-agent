import type { DatabaseSync } from "node:sqlite";

// Remembers which scheduler messages were already sent, so a restart or a repeated tick never sends twice.
export interface SentStore {
  has(userId: number, key: string): boolean;
  mark(userId: number, key: string): void;
  pruneOlderThan(timestamp: number): void;
}

export class SqliteSentStore implements SentStore {
  constructor(private readonly db: DatabaseSync) {}

  has(userId: number, key: string): boolean {
    return this.db.prepare("SELECT 1 FROM sent_notifications WHERE telegram_user_id = ? AND key = ?").get(userId, key) !== undefined;
  }

  mark(userId: number, key: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO sent_notifications (telegram_user_id, key, sent_at) VALUES (?, ?, ?)")
      .run(userId, key, Date.now());
  }

  pruneOlderThan(timestamp: number): void {
    this.db.prepare("DELETE FROM sent_notifications WHERE sent_at < ?").run(timestamp);
  }
}

