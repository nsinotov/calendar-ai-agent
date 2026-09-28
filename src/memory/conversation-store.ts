import type { DatabaseSync } from "node:sqlite";
import type { Message } from "../llm/types.js";

export interface ConversationStore {
  append(userId: number, message: Message): void;
  // Messages older than `retentionDays` are dropped. Within what's kept, tool results older
  // than `toolResultRetentionMinutes` are replaced with a short stale notice (the surrounding
  // chat text is unaffected) since they're usually the bulk of a conversation's token cost.
  load(userId: number, retentionDays: number, toolResultRetentionMinutes?: number): Message[];
  clear(userId: number): void;
}

interface MessageRow {
  role: Message["role"];
  content: string;
  created_at: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const STALE_TOOL_RESULT_NOTICE =
  "[Tool result expired from context; call the tool again if you still need this data.]";

export class SqliteConversationStore implements ConversationStore {
  constructor(private readonly db: DatabaseSync) {}

  append(userId: number, message: Message): void {
    this.db
      .prepare("INSERT INTO messages (telegram_user_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run(userId, message.role, JSON.stringify(message.content), Date.now());
  }

  load(userId: number, retentionDays: number, toolResultRetentionMinutes = Infinity): Message[] {
    this.purgeExpired(userId, retentionDays);
    const rows = this.db
      .prepare("SELECT role, content, created_at FROM messages WHERE telegram_user_id = ? ORDER BY id")
      .all(userId) as unknown as MessageRow[];

    const staleCutoff = Date.now() - toolResultRetentionMinutes * MINUTE_MS;
    // Content is written by append(), so it always matches the Message type.
    const messages = rows.map(
      (row): Message => ({
        role: row.role,
        content: withStaleToolResultsRedacted(JSON.parse(row.content) as Message["content"], row.created_at < staleCutoff),
      }),
    );

    return dropUntilUserText(messages);
  }

  clear(userId: number): void {
    this.db.prepare("DELETE FROM messages WHERE telegram_user_id = ?").run(userId);
  }

  private purgeExpired(userId: number, retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * DAY_MS;
    this.db
      .prepare("DELETE FROM messages WHERE telegram_user_id = ? AND created_at < ?")
      .run(userId, cutoff);
  }
}

function withStaleToolResultsRedacted(content: Message["content"], isStale: boolean): Message["content"] {
  if (typeof content === "string" || !isStale) {
    return content;
  }

  return content.map((block) => (block.type === "tool_result" ? { ...block, content: STALE_TOOL_RESULT_NOTICE } : block));
}

// Purging can cut a tool call from its result. Claude requires history to start
// with a plain user message, so drop everything before the first one.
function dropUntilUserText(messages: Message[]): Message[] {
  const start = messages.findIndex(
    (message) => message.role === "user" && typeof message.content === "string",
  );

  return start === -1 ? [] : messages.slice(start);
}

