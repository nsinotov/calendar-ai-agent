import type { DatabaseSync } from "node:sqlite";

export const MAX_PREFERENCES = 30;
export const MAX_PREFERENCE_LENGTH = 300;

export interface Preference {
  id: number;
  text: string;
}

export interface PreferencesStore {
  list(userId: number): Preference[];
  // Throws when the user already has MAX_PREFERENCES.
  add(userId: number, text: string): Preference;
  // Returns false when no preference with this id belongs to the user.
  update(userId: number, id: number, text: string): boolean;
  remove(userId: number, id: number): boolean;
}

export class SqlitePreferencesStore implements PreferencesStore {
  constructor(private readonly db: DatabaseSync) {}

  list(userId: number): Preference[] {
    const rows = this.db
      .prepare("SELECT id, text FROM user_preferences WHERE telegram_user_id = ? ORDER BY id")
      .all(userId) as unknown as Preference[];

    return rows.map(({ id, text }) => ({ id, text }));
  }

  add(userId: number, text: string): Preference {
    if (this.list(userId).length >= MAX_PREFERENCES) {
      throw new Error(`Preference limit (${MAX_PREFERENCES}) reached: remove or update an existing one`);
    }

    const result = this.db
      .prepare("INSERT INTO user_preferences (telegram_user_id, text, created_at) VALUES (?, ?, ?)")
      .run(userId, text, Date.now());

    return { id: Number(result.lastInsertRowid), text };
  }

  update(userId: number, id: number, text: string): boolean {
    const result = this.db
      .prepare("UPDATE user_preferences SET text = ? WHERE telegram_user_id = ? AND id = ?")
      .run(text, userId, id);

    return result.changes > 0;
  }

  remove(userId: number, id: number): boolean {
    const result = this.db
      .prepare("DELETE FROM user_preferences WHERE telegram_user_id = ? AND id = ?")
      .run(userId, id);

    return result.changes > 0;
  }
}

