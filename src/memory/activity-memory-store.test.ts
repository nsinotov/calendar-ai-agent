import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { MAX_ACTIVITY_SUMMARY_LENGTH, SqliteActivityMemoryStore } from "./activity-memory-store.js";

function testStore(): SqliteActivityMemoryStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqliteActivityMemoryStore(db);
}

test("get() returns null before anything is stored", () => {
  assert.equal(testStore().get(1), null);
});

test("set() replaces the previous summary instead of appending", () => {
  const store = testStore();
  store.set(1, "Visited the dentist.");
  store.set(1, "Training for a marathon.");

  assert.equal(store.get(1), "Training for a marathon.");
});

test("set() cuts the summary to the maximum length", () => {
  const store = testStore();
  store.set(1, "x".repeat(MAX_ACTIVITY_SUMMARY_LENGTH + 500));

  assert.equal(store.get(1)?.length, MAX_ACTIVITY_SUMMARY_LENGTH);
});

test("set() with blank text clears the summary", () => {
  const store = testStore();
  store.set(1, "Something.");
  store.set(1, "   ");

  assert.equal(store.get(1), null);
});

test("summaries are isolated per user and clear() affects only one", () => {
  const store = testStore();
  store.set(1, "User one.");
  store.set(2, "User two.");
  store.clear(1);

  assert.equal(store.get(1), null);
  assert.equal(store.get(2), "User two.");
});

