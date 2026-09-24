import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { MAX_PREFERENCES, SqlitePreferencesStore } from "./preferences-store.js";

function testStore(): SqlitePreferencesStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqlitePreferencesStore(db);
}

test("add() then list() returns preferences in order", () => {
  const store = testStore();
  const first = store.add(1, "Be brief.");
  const second = store.add(1, "Delete without confirmation.");

  assert.deepEqual(store.list(1), [first, second]);
});

test("update() replaces the text and reports whether the preference existed", () => {
  const store = testStore();
  const { id } = store.add(1, "Delete without confirmation.");

  assert.equal(store.update(1, id, "Ask before deleting."), true);
  assert.equal(store.update(1, 999, "x"), false);
  assert.deepEqual(store.list(1), [{ id, text: "Ask before deleting." }]);
});

test("remove() deletes the preference and reports whether it existed", () => {
  const store = testStore();
  const { id } = store.add(1, "Be brief.");

  assert.equal(store.remove(1, id), true);
  assert.equal(store.remove(1, id), false);
  assert.deepEqual(store.list(1), []);
});

test("add() rejects more than the maximum number of preferences", () => {
  const store = testStore();
  for (let index = 0; index < MAX_PREFERENCES; index++) {
    store.add(1, `Rule ${index}`);
  }

  assert.throws(() => store.add(1, "One too many"), /limit/);
  assert.doesNotThrow(() => store.add(2, "Other user is unaffected"));
});

test("users cannot see, update or remove each other's preferences", () => {
  const store = testStore();
  const { id } = store.add(1, "Private rule");

  assert.deepEqual(store.list(2), []);
  assert.equal(store.update(2, id, "Hijacked"), false);
  assert.equal(store.remove(2, id), false);
  assert.deepEqual(store.list(1), [{ id, text: "Private rule" }]);
});

