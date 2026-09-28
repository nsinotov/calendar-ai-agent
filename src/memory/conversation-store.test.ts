import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteConversationStore } from "./conversation-store.js";

function testStore(): { db: DatabaseSync; store: SqliteConversationStore } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return { db, store: new SqliteConversationStore(db) };
}

test("append() then load() returns messages in order", () => {
  const { store } = testStore();
  store.append(1, { role: "user", content: "hi" });
  store.append(1, { role: "assistant", content: [{ type: "text", text: "hello" }] });

  assert.deepEqual(store.load(1, 7), [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "hello" }] },
  ]);
});

test("load() drops messages older than the retention window", () => {
  const { db, store } = testStore();
  store.append(1, { role: "user", content: "old" });
  db.prepare("UPDATE messages SET created_at = created_at - 8 * 86400000").run();
  store.append(1, { role: "user", content: "new" });

  assert.deepEqual(store.load(1, 7), [{ role: "user", content: "new" }]);
});

test("load() drops a leading tool call left orphaned by expiry", () => {
  const { db, store } = testStore();
  store.append(1, { role: "user", content: "book a meeting" });
  store.append(1, { role: "assistant", content: [{ type: "tool_call", id: "t1", name: "x", input: {} }] });
  db.prepare("UPDATE messages SET created_at = created_at - 8 * 86400000 WHERE id <= 2").run();
  store.append(1, {
    role: "user",
    content: [{ type: "tool_result", callId: "t1", content: "ok" }],
  });
  store.append(1, { role: "user", content: "what's next?" });

  assert.deepEqual(store.load(1, 7), [{ role: "user", content: "what's next?" }]);
});

test("load() redacts tool results older than the tool-result retention window", () => {
  const { db, store } = testStore();
  store.append(1, { role: "user", content: "list my events" });
  store.append(1, { role: "assistant", content: [{ type: "tool_call", id: "t1", name: "list_events", input: {} }] });
  store.append(1, { role: "user", content: [{ type: "tool_result", callId: "t1", content: "[huge event dump]" }] });
  db.prepare("UPDATE messages SET created_at = created_at - 90 * 60000").run();
  store.append(1, { role: "assistant", content: [{ type: "text", text: "You have 3 events." }] });

  const loaded = store.load(1, 7, 60);

  assert.deepEqual(loaded[2], {
    role: "user",
    content: [{ type: "tool_result", callId: "t1", content: "[Tool result expired from context; call the tool again if you still need this data.]" }],
  });
  // The paired tool call and the surrounding chat text are unaffected.
  assert.deepEqual(loaded[1], { role: "assistant", content: [{ type: "tool_call", id: "t1", name: "list_events", input: {} }] });
  assert.deepEqual(loaded[0], { role: "user", content: "list my events" });
});

test("load() never redacts tool results when no tool-result retention is given", () => {
  const { db, store } = testStore();
  store.append(1, { role: "user", content: "list my events" });
  store.append(1, { role: "user", content: [{ type: "tool_result", callId: "t1", content: "fresh data" }] });
  db.prepare("UPDATE messages SET created_at = created_at - 90 * 60000").run();

  assert.deepEqual(store.load(1, 7).at(-1), {
    role: "user",
    content: [{ type: "tool_result", callId: "t1", content: "fresh data" }],
  });
});

test("clear() removes only that user's history", () => {
  const { store } = testStore();
  store.append(1, { role: "user", content: "mine" });
  store.append(2, { role: "user", content: "theirs" });

  store.clear(1);

  assert.deepEqual(store.load(1, 7), []);
  assert.deepEqual(store.load(2, 7), [{ role: "user", content: "theirs" }]);
});

test("one user's history is never visible to another user", () => {
  const { store } = testStore();
  store.append(1, { role: "user", content: "user 1 message" });
  store.append(2, { role: "user", content: "user 2 message" });

  assert.deepEqual(store.load(1, 7), [{ role: "user", content: "user 1 message" }]);
  assert.deepEqual(store.load(2, 7), [{ role: "user", content: "user 2 message" }]);
});

