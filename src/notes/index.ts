import type { DatabaseSync } from "node:sqlite";
import { SqliteNotesProvider } from "./sqlite-provider.js";
import type { NotesProvider } from "./types.js";

export type { Note, NoteInput, NotesProvider } from "./types.js";

export function createNotesProvider(db: DatabaseSync): NotesProvider {
  return new SqliteNotesProvider(db);
}

