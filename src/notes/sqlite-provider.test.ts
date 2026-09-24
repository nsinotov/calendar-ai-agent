import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteNotesProvider } from "./sqlite-provider.js";

function testProvider(): SqliteNotesProvider {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqliteNotesProvider(db);
}

test("add() returns the stored note and list() returns it", () => {
  const notes = testProvider();
  const note = notes.add(1, { text: "buy milk", context: "market" });

  assert.equal(note.text, "buy milk");
  assert.equal(note.context, "market");
  assert.deepEqual(notes.list(1), [note]);
});

test("add() without context stores null", () => {
  const notes = testProvider();

  assert.equal(notes.add(1, { text: "call mom" }).context, null);
});

test("list() with a query matches text and context, case-insensitively", () => {
  const notes = testProvider();
  notes.add(1, { text: "buy milk", context: "Market" });
  notes.add(1, { text: "pay rent" });
  notes.add(1, { text: "market research" });

  assert.deepEqual(
    notes.list(1, "market").map((note) => note.text),
    ["buy milk", "market research"],
  );
});

test("list() treats LIKE wildcards in the query literally", () => {
  const notes = testProvider();
  notes.add(1, { text: "100% done" });
  notes.add(1, { text: "other" });

  assert.deepEqual(
    notes.list(1, "%").map((note) => note.text),
    ["100% done"],
  );
});

test("remove() deletes the note and reports whether it existed", () => {
  const notes = testProvider();
  const note = notes.add(1, { text: "buy milk" });

  assert.equal(notes.remove(1, note.id), true);
  assert.equal(notes.remove(1, note.id), false);
  assert.deepEqual(notes.list(1), []);
});

test("removeAll() returns the count and clears only that user's notes", () => {
  const notes = testProvider();
  notes.add(1, { text: "a" });
  notes.add(1, { text: "b" });
  notes.add(2, { text: "c" });

  assert.equal(notes.removeAll(1), 2);
  assert.deepEqual(notes.list(1), []);
  assert.equal(notes.list(2).length, 1);
});

test("users cannot see or remove each other's notes", () => {
  const notes = testProvider();
  const note = notes.add(1, { text: "secret" });

  assert.deepEqual(notes.list(2), []);
  assert.deepEqual(notes.list(2, "secret"), []);
  assert.equal(notes.remove(2, note.id), false);
  assert.equal(notes.list(1).length, 1);
});

