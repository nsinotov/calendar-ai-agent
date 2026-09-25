import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteBillingStore } from "./billing-store.js";

function testStore(): SqliteBillingStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);

  return new SqliteBillingStore(db);
}

test("a fresh store tracks nothing", () => {
  assert.deepEqual(testStore().get(), { balanceUsd: null, lowNotified: false, outage: false });
});

test("deduct() does nothing while no balance is set", () => {
  const store = testStore();
  store.deduct(1);

  assert.equal(store.get().balanceUsd, null);
});

test("setBalance() then deduct() lowers the balance", () => {
  const store = testStore();
  store.setBalance(10);
  store.deduct(2.5);

  assert.equal(store.get().balanceUsd, 7.5);
});

test("setBalance() clears the low-balance and outage flags", () => {
  const store = testStore();
  store.setLowNotified(true);
  store.setOutage(true);

  store.setBalance(20);

  assert.deepEqual(store.get(), { balanceUsd: 20, lowNotified: false, outage: false });
});

test("the state survives reopening the store on the same database", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  new SqliteBillingStore(db).setBalance(5);

  assert.equal(new SqliteBillingStore(db).get().balanceUsd, 5);
});

