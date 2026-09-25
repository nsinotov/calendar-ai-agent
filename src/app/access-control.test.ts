import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteUserStore } from "../memory/user-store.js";
import { AccessControl } from "./access-control.js";

function testAccess(now: () => number = () => 0): AccessControl {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const users = new SqliteUserStore(db);
  users.upsert(1, "user");

  return new AccessControl(users, 1000, now);
}

test("a registered user is allowed", () => {
  assert.equal(testAccess().check(1), "allowed");
});

test("an unregistered sender is rejected once, then ignored", () => {
  const access = testAccess();

  assert.equal(access.check(99), "rejected");
  assert.equal(access.check(99), "ignored");
  assert.equal(access.check(99), "ignored");
});

test("an ignored sender is rejected again after the memory expires", () => {
  let time = 0;
  const access = testAccess(() => time);

  access.check(99);
  time = 1001;

  assert.equal(access.check(99), "rejected");
});

test("rejections are tracked per sender", () => {
  const access = testAccess();

  access.check(99);

  assert.equal(access.check(100), "rejected");
});

