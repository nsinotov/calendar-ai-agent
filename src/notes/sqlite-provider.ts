import type { DatabaseSync } from "node:sqlite";
import type { Note, NoteInput, NotesProvider } from "./types.js";

interface NoteRow {
  id: number;
  text: string;
  context: string | null;
  created_at: number;
}

export class SqliteNotesProvider implements NotesProvider {
  constructor(private readonly db: DatabaseSync) {}

  add(userId: number, input: NoteInput): Note {
    const context = input.context ?? null;
    const createdAt = Date.now();
    const result = this.db
      .prepare("INSERT INTO notes (telegram_user_id, text, context, created_at) VALUES (?, ?, ?, ?)")
      .run(userId, input.text, context, createdAt);

    return { id: Number(result.lastInsertRowid), text: input.text, context, createdAt };
  }

  list(userId: number, query?: string): Note[] {
    const trimmed = query?.trim();
    const rows = trimmed
      ? (this.db
          .prepare(
            `SELECT id, text, context, created_at FROM notes
             WHERE telegram_user_id = ? AND (text LIKE ? ESCAPE '\\' OR context LIKE ? ESCAPE '\\')
             ORDER BY id`,
          )
          .all(userId, likePattern(trimmed), likePattern(trimmed)) as unknown as NoteRow[])
      : (this.db
          .prepare("SELECT id, text, context, created_at FROM notes WHERE telegram_user_id = ? ORDER BY id")
          .all(userId) as unknown as NoteRow[]);

    return rows.map(toNote);
  }

  remove(userId: number, noteId: number): boolean {
    const result = this.db
      .prepare("DELETE FROM notes WHERE telegram_user_id = ? AND id = ?")
      .run(userId, noteId);

    return result.changes > 0;
  }

  removeAll(userId: number): number {
    const result = this.db.prepare("DELETE FROM notes WHERE telegram_user_id = ?").run(userId);

    return Number(result.changes);
  }
}

function toNote(row: NoteRow): Note {
  return { id: row.id, text: row.text, context: row.context, createdAt: row.created_at };
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

