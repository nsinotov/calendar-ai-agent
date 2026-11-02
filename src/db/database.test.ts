import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { MIGRATIONS, SCHEMA, migrate } from "./database.js";

function version(db: DatabaseSync): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

test("a new database gets every migration and the latest version", () => {
  const db = new DatabaseSync(":memory:");

  migrate(db);

  assert.equal(version(db), MIGRATIONS.length);
  assert.ok(tableExists(db, "users"));
});

test("only pending migrations run, and running again changes nothing", () => {
  const db = new DatabaseSync(":memory:");
  const migrations = ["CREATE TABLE a (x)", "ALTER TABLE a ADD COLUMN y"];

  migrate(db, migrations.slice(0, 1));
  migrate(db, migrations);
  migrate(db, migrations);

  assert.equal(version(db), 2);
  assert.deepEqual(
    db
      .prepare("PRAGMA table_info(a)")
      .all()
      .map((column) => column.name),
    ["x", "y"],
  );
});

test("a database created before versioning is adopted with its data", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();

  migrate(db);

  assert.equal(version(db), MIGRATIONS.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()?.n, 1);
});

test("a failing migration is rolled back and keeps the previous version", () => {
  const db = new DatabaseSync(":memory:");
  const migrations = ["CREATE TABLE a (x)", "CREATE TABLE b (x); INSERT INTO missing VALUES (1)"];

  assert.throws(() => migrate(db, migrations), /no such table: missing/);

  assert.equal(version(db), 1);
  assert.ok(tableExists(db, "a"));
  assert.ok(!tableExists(db, "b"));
});

test("a database newer than the app is refused", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA user_version = 99");

  assert.throws(() => migrate(db), /newer than this app supports/);
});
