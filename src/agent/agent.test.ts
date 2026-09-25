import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "../llm/types.js";
import { SqliteConversationStore } from "../memory/conversation-store.js";
import { Agent } from "./agent.js";
import { defineTool, type Tool } from "./tool.js";
import { z } from "zod";

const usage = { inputTokens: 0, outputTokens: 0 };

function scriptedLlm(responses: LlmResponse[]): { llm: LlmProvider; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const llm: LlmProvider = {
    async complete(request) {
      requests.push({ ...request, messages: [...request.messages] });
      const next = responses.shift();
      assert.ok(next, "unexpected extra LLM call");

      return next;
    },
  };

  return { llm, requests };
}

function testConversations(): SqliteConversationStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();

  return new SqliteConversationStore(db);
}

const echoTool: Tool = defineTool(
  {
    name: "echo",
    description: "Echo the text back.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  z.object({ text: z.string() }),
  ({ text }) => ({ echoed: text }),
);

test("reply() returns the text when the model answers without tools", async () => {
  const { llm } = scriptedLlm([{ content: [{ type: "text", text: "Hello" }], stopReason: "end_turn", usage }]);
  const agent = new Agent(llm, testConversations());

  assert.equal(await agent.reply(1, "hi", { system: "s", tools: [], retentionDays: 7 }), "Hello");
});

test("reply() runs requested tools, feeds results back and returns the final text", async () => {
  const conversations = testConversations();
  const { llm, requests } = scriptedLlm([
    {
      content: [{ type: "tool_call", id: "c1", name: "echo", input: { text: "x" } }],
      stopReason: "tool_use",
      usage,
    },
    { content: [{ type: "text", text: "Done" }], stopReason: "end_turn", usage },
  ]);
  const agent = new Agent(llm, conversations);

  assert.equal(await agent.reply(1, "go", { system: "s", tools: [echoTool], retentionDays: 7 }), "Done");
  assert.deepEqual(requests[1]?.messages.at(-1), {
    role: "user",
    content: [{ type: "tool_result", callId: "c1", content: '{"echoed":"x"}' }],
  });
  assert.equal(conversations.load(1, 7).length, 4);
});

test("tool failures and unknown tools become error results instead of throwing", async () => {
  const { llm, requests } = scriptedLlm([
    {
      content: [
        { type: "tool_call", id: "c1", name: "echo", input: { text: 5 } },
        { type: "tool_call", id: "c2", name: "missing", input: {} },
      ],
      stopReason: "tool_use",
      usage,
    },
    { content: [{ type: "text", text: "Sorry" }], stopReason: "end_turn", usage },
  ]);
  const agent = new Agent(llm, testConversations());

  await agent.reply(1, "go", { system: "s", tools: [echoTool], retentionDays: 7 });
  const results = requests[1]?.messages.at(-1)?.content;

  assert.ok(Array.isArray(results));
  assert.deepEqual(
    results.map((block) => block.type === "tool_result" && block.isError),
    [true, true],
  );
});

test("reply() gives up after the step limit", async () => {
  const loop: LlmResponse = {
    content: [{ type: "tool_call", id: "c", name: "echo", input: { text: "x" } }],
    stopReason: "tool_use",
    usage,
  };
  const { llm } = scriptedLlm([loop, loop]);
  const agent = new Agent(llm, testConversations(), 2);

  await assert.rejects(agent.reply(1, "go", { system: "s", tools: [echoTool], retentionDays: 7 }), /did not finish/);
});

