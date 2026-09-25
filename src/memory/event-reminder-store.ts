import type { DatabaseSync } from "node:sqlite";

export interface EventReminderStore {
  // Minutes before the event the user asked to be reminded, or null when they did not.
  get(userId: number, eventId: string): number | null;
  set(userId: number, eventId: string, minutesBefore: number): void;
  // Returns false when no custom reminder exists for the event.
  remove(userId: number, eventId: string): boolean;
  // Drops entries created before the timestamp (their events are long past).
  pruneOlderThan(timestamp: number): void;
}

export class SqliteEventReminderStore implements EventReminderStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: number, eventId: string): number | null {
    const row = this.db
      .prepare("SELECT minutes_before FROM event_reminders WHERE telegram_user_id = ? AND event_id = ?")
      .get(userId, eventId) as { minutes_before: number } | undefined;

    return row ? row.minutes_before : null;
  }

  set(userId: number, eventId: string, minutesBefore: number): void {
    this.db
      .prepare(
        `INSERT INTO event_reminders (telegram_user_id, event_id, minutes_before, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (telegram_user_id, event_id) DO UPDATE SET minutes_before = excluded.minutes_before`,
      )
      .run(userId, eventId, minutesBefore, Date.now());
  }

  remove(userId: number, eventId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM event_reminders WHERE telegram_user_id = ? AND event_id = ?")
      .run(userId, eventId);

    return Number(result.changes) > 0;
  }

  pruneOlderThan(timestamp: number): void {
    this.db.prepare("DELETE FROM event_reminders WHERE created_at < ?").run(timestamp);
  }
}

