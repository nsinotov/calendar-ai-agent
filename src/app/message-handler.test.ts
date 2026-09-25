import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Agent } from "../agent/index.js";
import { BillingService, OUTAGE_USER_TEXT } from "../billing/billing-service.js";
import { SqliteBillingStore } from "../billing/billing-store.js";
import { SCHEMA } from "../db/database.js";
import { LlmError } from "../llm/errors.js";
import type { LlmProvider } from "../llm/types.js";
import { SqliteConversationStore } from "../memory/conversation-store.js";
import { SqliteUserStore } from "../memory/user-store.js";
import type { MessagingProvider } from "../messaging/index.js";
import { AccessControl } from "./access-control.js";
import { createCommands } from "./commands.js";
import { createMessageHandler } from "./message-handler.js";

function setup(llm: LlmProvider) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const users = new SqliteUserStore(db);
  users.upsert(1, "user");
  users.upsert(2, "admin");
  const conversations = new SqliteConversationStore(db);
  const billingStore = new SqliteBillingStore(db);
  const billing = new BillingService(
    billingStore,
    { notifyAdmins: async () => {}, broadcast: async () => {} },
    { prices: { inputPerMtok: 1, outputPerMtok: 1 }, lowBalanceUsd: 1, probeIntervalMs: 60_000 },
  );
  const sent: [number, string][] = [];
  const messaging: MessagingProvider = {
    onMessage() {},
    send: async (userId, text) => {
      sent.push([userId, text]);
    },
    start: async () => {},
    stop: async () => {},
  };
  const handler = createMessageHandler({
    messaging,
    access: new AccessControl(users),
    users,
    billing,
    commands: createCommands({ conversations, billing, llm, languageOf: () => "uk" }),
    agent: new Agent(llm, conversations),
    buildContext: () => ({ system: "s", tools: [], retentionDays: 7 }),
  });

  return { handler, sent, conversations, billing, billingStore };
}

const answering: LlmProvider = {
  complete: async () => ({ content: [{ type: "text", text: "Hello" }], stopReason: "end_turn" }),
} as unknown as LlmProvider;

const failing: LlmProvider = {
  complete: async () => {
    throw new Error("llm down");
  },
} as unknown as LlmProvider;

const noCredits: LlmProvider = {
  complete: async () => {
    throw new LlmError("insufficient_credits", "no credits");
  },
} as unknown as LlmProvider;

test("a registered user's message goes to the agent and the reply is sent back", async () => {
  const { handler, sent } = setup(answering);

  await handler({ userId: 1, text: "hi" });

  assert.deepEqual(sent, [[1, "Hello"]]);
});

test("an unregistered sender gets one static reply and no LLM call", async () => {
  const { handler, sent } = setup(failing);

  await handler({ userId: 99, text: "hi" });
  await handler({ userId: 99, text: "hi again" });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]![0], 99);
});

test("/clear wipes the history and sends the LLM's translation of the confirmation", async () => {
  const { handler, sent, conversations } = setup(answering);
  conversations.append(1, { role: "user", content: "old" });

  await handler({ userId: 1, text: "/clear" });

  assert.deepEqual(conversations.load(1, 7), []);
  assert.deepEqual(sent, [[1, "Hello"]]);
});

test("/clear falls back to the English confirmation when the LLM fails", async () => {
  const { handler, sent, conversations } = setup(failing);
  conversations.append(1, { role: "user", content: "old" });

  await handler({ userId: 1, text: "/clear" });

  assert.deepEqual(conversations.load(1, 7), []);
  assert.deepEqual(sent, [[1, "Conversation history cleared."]]);
});

test("an agent failure sends a static apology and rethrows", async () => {
  const { handler, sent } = setup(failing);

  await assert.rejects(handler({ userId: 1, text: "hi" }), /llm down/);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]![0], 1);
});

test("/balance shows the tracked balance to admins", async () => {
  const { handler, sent, billingStore } = setup(failing);
  billingStore.setBalance(12.345);

  await handler({ userId: 2, text: "/balance" });

  assert.match(sent[0]![1], /\$12\.35/);
});

test("/balance from a regular user is treated as an ordinary message", async () => {
  const { handler, sent, billingStore } = setup(answering);
  billingStore.setBalance(12);

  await handler({ userId: 1, text: "/balance" });

  assert.deepEqual(sent, [[1, "Hello"]]);
});

test("/setbalance sets the balance and clears the outage for admins", async () => {
  const { handler, sent, billingStore } = setup(failing);
  billingStore.setOutage(true);

  await handler({ userId: 2, text: "/setbalance 20" });

  assert.equal(billingStore.get().balanceUsd, 20);
  assert.equal(billingStore.get().outage, false);
  assert.match(sent[0]![1], /\$20\.00/);
});

test("/setbalance with a bad amount shows the usage and changes nothing", async () => {
  const { handler, sent, billingStore } = setup(failing);
  billingStore.setBalance(5);

  await handler({ userId: 2, text: "/setbalance abc" });
  await handler({ userId: 2, text: "/setbalance" });

  assert.equal(billingStore.get().balanceUsd, 5);
  assert.equal(sent.length, 2);
  assert.match(sent[0]![1], /Usage/);
});

test("/setbalance from a regular user is treated as an ordinary message", async () => {
  const { handler, sent, billingStore } = setup(answering);
  billingStore.setBalance(5);

  await handler({ userId: 1, text: "/setbalance 100" });

  assert.equal(billingStore.get().balanceUsd, 5);
  assert.deepEqual(sent, [[1, "Hello"]]);
});

test("an out-of-credits error gets the outage reply and does not throw", async () => {
  const { handler, sent } = setup(noCredits);

  await handler({ userId: 1, text: "hi" });

  assert.deepEqual(sent, [[1, OUTAGE_USER_TEXT]]);
});

test("during an outage messages get the static reply without an LLM call", async () => {
  let calls = 0;
  const counting: LlmProvider = {
    complete: async () => {
      calls++;

      return { content: [{ type: "text", text: "Hello" }], stopReason: "end_turn" };
    },
  } as unknown as LlmProvider;
  const { handler, sent, billing, billingStore } = setup(counting);
  billingStore.setOutage(true);
  billing.blocksRequests();

  await handler({ userId: 1, text: "hi" });

  assert.equal(calls, 0);
  assert.deepEqual(sent, [[1, OUTAGE_USER_TEXT]]);
});

