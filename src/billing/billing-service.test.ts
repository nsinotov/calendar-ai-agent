import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { LlmError } from "../llm/errors.js";
import { BillingService, type BillingConfig, type Notifier } from "./billing-service.js";
import { SqliteBillingStore } from "./billing-store.js";

const usage = { inputTokens: 1_000_000, outputTokens: 0 };

function setup(overrides: Partial<BillingConfig> = {}, now: () => number = () => 0) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const store = new SqliteBillingStore(db);
  const admin: string[] = [];
  const everyone: string[] = [];
  const notifier: Notifier = {
    notifyAdmins: async (text) => void admin.push(text),
    broadcast: async (text) => void everyone.push(text),
  };
  const service = new BillingService(
    store,
    notifier,
    { prices: { inputPerMtok: 1, outputPerMtok: 2 }, lowBalanceUsd: 2, probeIntervalMs: 1000, ...overrides },
    now,
  );

  return { store, service, admin, everyone };
}

test("recordSuccess() deducts the estimated cost", () => {
  const { store, service } = setup();
  store.setBalance(10);

  service.recordSuccess({ inputTokens: 1_000_000, outputTokens: 500_000 });

  assert.equal(store.get().balanceUsd, 8);
});

test("nothing is deducted without prices", () => {
  const { store, service } = setup({ prices: null });
  store.setBalance(10);

  service.recordSuccess(usage);

  assert.equal(store.get().balanceUsd, 10);
  assert.equal(service.balanceUsd(), null);
});

test("the low-balance warning goes to admins once per crossing", () => {
  const { store, service, admin } = setup();
  store.setBalance(3);

  service.recordSuccess(usage);
  service.recordSuccess(usage);

  assert.equal(admin.length, 1);
  assert.match(admin[0]!, /Low LLM balance/);
});

test("the low-balance warning is re-armed after the balance is raised", () => {
  const { store, service, admin } = setup();
  store.setBalance(2.5);
  service.recordSuccess(usage);

  store.setBalance(10);
  service.recordSuccess(usage);
  store.setBalance(2.5);
  service.recordSuccess(usage);

  assert.equal(admin.length, 2);
});

test("an out-of-credits error starts an outage with one broadcast and one admin message", () => {
  const { service, admin, everyone } = setup();
  const error = new LlmError("insufficient_credits", "no credits");

  service.recordFailure(error);
  service.recordFailure(error);

  assert.equal(service.isOutage(), true);
  assert.equal(everyone.length, 1);
  assert.equal(admin.length, 1);
});

test("other LLM errors do not start an outage", () => {
  const { service, everyone } = setup();

  service.recordFailure(new LlmError("rate_limit", "slow down"));
  service.recordFailure(new Error("boom"));

  assert.equal(service.isOutage(), false);
  assert.equal(everyone.length, 0);
});

test("a successful call ends the outage and a new outage broadcasts again", () => {
  const { service, everyone } = setup();
  const error = new LlmError("insufficient_credits", "no credits");

  service.recordFailure(error);
  service.recordSuccess(usage);
  service.recordFailure(error);

  assert.equal(everyone.length, 2);
});

test("during an outage requests are blocked except one probe per interval", () => {
  let time = 0;
  const { service } = setup({}, () => time);
  service.recordFailure(new LlmError("insufficient_credits", "no credits"));

  assert.equal(service.blocksRequests(), true);
  time = 1000;
  assert.equal(service.blocksRequests(), false);
  assert.equal(service.blocksRequests(), true);
});

test("requests are never blocked without an outage", () => {
  assert.equal(setup().service.blocksRequests(), false);
});

