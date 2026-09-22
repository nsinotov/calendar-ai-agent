import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteUserSecretsStore } from "./user-secrets-store.js";

function testStore(): SqliteUserSecretsStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqliteUserSecretsStore(db, randomBytes(32));
}

test("get() returns null when nothing is registered", () => {
  const store = testStore();

  assert.equal(store.get(1, "calendar", "google"), null);
});

test("set() then get() round-trips the credentials", () => {
  const store = testStore();
  store.set(1, "calendar", "google", { refreshToken: "rt-1", calendarId: "primary" });

  assert.deepEqual(store.get(1, "calendar", "google"), { refreshToken: "rt-1", calendarId: "primary" });
});

test("set() overwrites a previous registration for the same provider", () => {
  const store = testStore();
  store.set(1, "calendar", "google", { refreshToken: "old" });
  store.set(1, "calendar", "google", { refreshToken: "new" });

  assert.deepEqual(store.get(1, "calendar", "google"), { refreshToken: "new" });
});

test("listProviders() reflects what's registered for that user and kind", () => {
  const store = testStore();
  store.set(1, "calendar", "google", { refreshToken: "rt-1" });

  assert.deepEqual(store.listProviders(1, "calendar"), ["google"]);
  assert.deepEqual(store.listProviders(2, "calendar"), []);
});

test("remove() deletes the registration", () => {
  const store = testStore();
  store.set(1, "calendar", "google", { refreshToken: "rt-1" });
  store.remove(1, "calendar", "google");

  assert.equal(store.get(1, "calendar", "google"), null);
});

test("one user's secrets are never visible to another user", () => {
  const store = testStore();
  store.set(1, "calendar", "google", { refreshToken: "user-1-token" });
  store.set(2, "calendar", "google", { refreshToken: "user-2-token" });

  assert.deepEqual(store.get(1, "calendar", "google"), { refreshToken: "user-1-token" });
  assert.deepEqual(store.get(2, "calendar", "google"), { refreshToken: "user-2-token" });
  assert.deepEqual(store.listProviders(1, "calendar"), ["google"]);
  assert.deepEqual(store.listProviders(2, "calendar"), ["google"]);
});

