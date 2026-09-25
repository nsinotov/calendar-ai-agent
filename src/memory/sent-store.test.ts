import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteSentStore } from "./sent-store.js";

function testStore(): { db: DatabaseSync; store: SqliteSentStore } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return { db, store: new SqliteSentStore(db) };
}

test("has() is true only after mark(), and marking twice is harmless", () => {
  const { store } = testStore();
  assert.equal(store.has(1, "daily:2026-09-25"), false);

  store.mark(1, "daily:2026-09-25");
  store.mark(1, "daily:2026-09-25");

  assert.equal(store.has(1, "daily:2026-09-25"), true);
});

test("marks are isolated per user", () => {
  const { store } = testStore();
  store.mark(1, "k");

  assert.equal(store.has(2, "k"), false);
});

test("pruneOlderThan() drops only old marks", () => {
  const { db, store } = testStore();
  store.mark(1, "old");
  store.mark(1, "new");
  db.prepare("UPDATE sent_notifications SET sent_at = 0 WHERE key = 'old'").run();

  store.pruneOlderThan(1000);

  assert.equal(store.has(1, "old"), false);
  assert.equal(store.has(1, "new"), true);
});

