import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteUserSettingsStore } from "./user-settings-store.js";

function testStore(): SqliteUserSettingsStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqliteUserSettingsStore(db);
}

test("get() returns schema defaults when no row exists", () => {
  const store = testStore();
  const settings = store.get(1);

  assert.equal(settings.name, null);
  assert.equal(settings.askedForName, false);
  assert.equal(settings.language, "uk");
  assert.equal(settings.weekStart, "monday");
  assert.equal(settings.llmProvider, "anthropic");
});

test("update() merges a partial patch onto existing settings", () => {
  const store = testStore();
  store.update(1, { name: "Nikolay", askedForName: true });
  const settings = store.update(1, { weekStart: "sunday" });

  assert.equal(settings.name, "Nikolay");
  assert.equal(settings.askedForName, true);
  assert.equal(settings.weekStart, "sunday");
});

test("get() backfills a field missing from an older stored blob", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();
  // Simulates a settings blob written before `oldEventsAction` existed.
  db.prepare("INSERT INTO user_settings (telegram_user_id, settings, updated_at) VALUES (1, ?, 0)").run(
    JSON.stringify({ name: "Nikolay" }),
  );
  const store = new SqliteUserSettingsStore(db);

  const settings = store.get(1);
  assert.equal(settings.name, "Nikolay");
  assert.equal(settings.oldEventsAction, "keep");
});

test("one user's settings are never visible to another user", () => {
  const store = testStore();
  store.update(1, { name: "Nikolay" });
  store.update(2, { name: "Kolya" });

  assert.equal(store.get(1).name, "Nikolay");
  assert.equal(store.get(2).name, "Kolya");
});

