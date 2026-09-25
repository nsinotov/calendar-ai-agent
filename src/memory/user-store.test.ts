import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteUserStore } from "./user-store.js";

function testStore(): SqliteUserStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);

  return new SqliteUserStore(db);
}

test("get() returns null for an unknown user", () => {
  assert.equal(testStore().get(1), null);
});

test("upsert() creates a user with the given role", () => {
  const store = testStore();
  store.upsert(1, "admin");
  store.upsert(2, "user");

  assert.deepEqual(store.get(1), { id: 1, role: "admin" });
  assert.deepEqual(store.get(2), { id: 2, role: "user" });
});

test("upsert() changes the role of an existing user", () => {
  const store = testStore();
  store.upsert(1, "user");
  store.upsert(1, "admin");

  assert.deepEqual(store.list(), [{ id: 1, role: "admin" }]);
});

test("listAdmins() returns only admins", () => {
  const store = testStore();
  store.upsert(1, "admin");
  store.upsert(2, "user");
  store.upsert(3, "admin");

  assert.deepEqual(store.listAdmins().map((user) => user.id), [1, 3]);
});

test("users inserted without a role default to user", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();

  assert.equal(new SqliteUserStore(db).get(1)?.role, "user");
});

test("the database rejects an unknown role", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);

  assert.throws(() => db.prepare("INSERT INTO users (telegram_user_id, role, created_at) VALUES (1, 'root', 0)").run());
});

