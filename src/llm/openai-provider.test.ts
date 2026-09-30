import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { LlmError } from "./errors.js";
import { OpenAiProvider } from "./openai-provider.js";

function fakeClient(create: (params: unknown) => unknown): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

test("complete() converts messages, tools and the response", async () => {
  let sentParams: unknown;
  const client = fakeClient((params) => {
    sentParams = params;

    return {
      choices: [
        {
          message: {
            content: "Checking",
            tool_calls: [
              { id: "c1", type: "function", function: { name: "list_events", arguments: '{"day":"today"}' } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
    };
  });
  const provider = new OpenAiProvider(client, { model: "gpt-5.1", maxTokens: 100 });

  const response = await provider.complete({
    system: "sys",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "tool_call", id: "t0", name: "x", input: {} }] },
      { role: "user", content: [{ type: "tool_result", callId: "t0", content: "ok" }] },
    ],
    tools: [{ name: "list_events", description: "d", inputSchema: { type: "object", properties: {} } }],
  });

  assert.deepEqual(response, {
    content: [
      { type: "text", text: "Checking" },
      { type: "tool_call", id: "c1", name: "list_events", input: { day: "today" } },
    ],
    stopReason: "tool_use",
    usage: { inputTokens: 12, outputTokens: 6 },
  });
  assert.deepEqual(sentParams, {
    model: "gpt-5.1",
    max_completion_tokens: 100,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t0", type: "function", function: { name: "x", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "t0", content: "ok" },
    ],
    tools: [{ type: "function", function: { name: "list_events", description: "d", parameters: { type: "object", properties: {} } } }],
  });
});

test("complete() sends an empty string, not null, for an assistant message with no text and no tool calls", async () => {
  let sentParams: unknown;
  const client = fakeClient((params) => {
    sentParams = params;

    return {
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
  });
  const provider = new OpenAiProvider(client, { model: "gpt-5.1", maxTokens: 100 });

  await provider.complete({
    system: "sys",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [] },
    ],
    tools: [],
  });

  assert.deepEqual((sentParams as { messages: unknown[] }).messages[2], {
    role: "assistant",
    content: "",
    tool_calls: undefined,
  });
});

test("complete() maps SDK errors to LlmError kinds, including the quota/rate-limit split", async () => {
  const headers = new Headers();
  const cases: [string, Error, string][] = [
    [
      "insufficient quota",
      new OpenAI.RateLimitError(429, { message: "You exceeded your current quota", code: "insufficient_quota" }, undefined, headers),
      "insufficient_credits",
    ],
    [
      "plain rate limit",
      new OpenAI.RateLimitError(429, { message: "Slow down", code: "rate_limit_exceeded" }, undefined, headers),
      "rate_limit",
    ],
    ["auth", new OpenAI.AuthenticationError(401, { message: "bad key" }, undefined, headers), "auth"],
  ];

  for (const [label, sdkError, expectedKind] of cases) {
    const client = fakeClient(() => {
      throw sdkError;
    });
    const provider = new OpenAiProvider(client, { model: "m", maxTokens: 1 });

    await assert.rejects(
      provider.complete({ system: "", messages: [], tools: [] }),
      (error: unknown) => {
        assert.ok(error instanceof LlmError, `${label}: expected an LlmError`);
        assert.equal(error.kind, expectedKind, label);

        return true;
      },
    );
  }
});

