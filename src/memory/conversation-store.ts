import type { DatabaseSync } from "node:sqlite";
import type { Message } from "../llm/types.js";

export interface ConversationStore {
  append(userId: number, message: Message): void;
  load(userId: number): Message[];
  clear(userId: number): void;
}

interface MessageRow {
  role: Message["role"];
  content: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class SqliteConversationStore implements ConversationStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly retentionDays: number,
  ) {}

  append(userId: number, message: Message): void {
    this.db
      .prepare("INSERT INTO messages (telegram_user_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(userId, message.role, JSON.stringify(message.content), Date.now());
  }

  load(userId: number): Message[] {
    this.purgeExpired(userId);
    const rows = this.db
      .prepare("SELECT role, content FROM messages WHERE telegram_user_id = ? ORDER BY id")
      .all(userId) as unknown as MessageRow[];

    // Content is written by append(), so it always matches the Message type.
    const messages = rows.map(
      (row): Message => ({
        role: row.role,
        content: JSON.parse(row.content) as Message["content"],
      }),
    );

    return dropUntilUserText(messages);
  }

  clear(userId: number): void {
    this.db.prepare("DELETE FROM messages WHERE telegram_user_id = ?").run(userId);
  }

  private purgeExpired(userId: number): void {
    const cutoff = Date.now() - this.retentionDays * DAY_MS;
    this.db
      .prepare("DELETE FROM messages WHERE telegram_user_id = ? AND created_at < ?")
      .run(userId, cutoff);
  }
}

// Purging can cut a tool call from its result. Claude requires history to start
// with a plain user message, so drop everything before the first one.
function dropUntilUserText(messages: Message[]): Message[] {
  const start = messages.findIndex(
    (message) => message.role === "user" && typeof message.content === "string",
  );

  return start === -1 ? [] : messages.slice(start);
}

