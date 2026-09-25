import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Agent } from "../agent/index.js";
import { SCHEMA } from "../db/database.js";
import type { LlmProvider } from "../llm/types.js";
import { SqliteConversationStore } from "../memory/conversation-store.js";
import { SqliteUserStore } from "../memory/user-store.js";
import type { MessagingProvider } from "../messaging/index.js";
import { AccessControl } from "./access-control.js";
import { createMessageHandler } from "./message-handler.js";

function setup(llm: LlmProvider) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const users = new SqliteUserStore(db);
  users.upsert(1, "user");
  const conversations = new SqliteConversationStore(db);
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
    conversations,
    agent: new Agent(llm, conversations),
    llm,
    languageOf: () => "uk",
    buildContext: () => ({ system: "s", tools: [], retentionDays: 7 }),
  });

  return { handler, sent, conversations };
}

const answering: LlmProvider = {
  complete: async () => ({ content: [{ type: "text", text: "Hello" }], stopReason: "end_turn" }),
} as unknown as LlmProvider;

const failing: LlmProvider = {
  complete: async () => {
    throw new Error("llm down");
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
