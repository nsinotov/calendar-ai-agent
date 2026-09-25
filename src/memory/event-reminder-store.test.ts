import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteEventReminderStore } from "./event-reminder-store.js";

function testStore(): { db: DatabaseSync; store: SqliteEventReminderStore } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return { db, store: new SqliteEventReminderStore(db) };
}

test("get() is null until a reminder is set, and set() replaces it", () => {
  const { store } = testStore();
  assert.equal(store.get(1, "e1"), null);

  store.set(1, "e1", 120);
  store.set(1, "e1", 30);

  assert.equal(store.get(1, "e1"), 30);
});

test("remove() reports whether something was removed", () => {
  const { store } = testStore();
  store.set(1, "e1", 60);

  assert.equal(store.remove(1, "e1"), true);
  assert.equal(store.remove(1, "e1"), false);
  assert.equal(store.get(1, "e1"), null);
});

test("reminders are isolated per user", () => {
  const { store } = testStore();
  store.set(1, "e1", 60);

  assert.equal(store.get(2, "e1"), null);
  assert.equal(store.remove(2, "e1"), false);
});

test("pruneOlderThan() drops only old entries", () => {
  const { db, store } = testStore();
  store.set(1, "old", 60);
  store.set(1, "new", 60);
  db.prepare("UPDATE event_reminders SET created_at = 0 WHERE event_id = 'old'").run();

  store.pruneOlderThan(1000);

  assert.equal(store.get(1, "old"), null);
  assert.equal(store.get(1, "new"), 60);
});

