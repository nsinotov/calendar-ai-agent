export interface Note {
  id: number;
  text: string;
  context: string | null;
  createdAt: number;
}

export interface NoteInput {
  text: string;
  context?: string;
}

export interface NotesProvider {
  add(userId: number, input: NoteInput): Note;
  // The query is matched case-insensitively against both text and context.
  list(userId: number, query?: string): Note[];
  // Returns false when no note with this id belongs to the user.
  remove(userId: number, noteId: number): boolean;
  removeAll(userId: number): number;
}

