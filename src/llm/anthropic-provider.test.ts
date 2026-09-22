import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic-provider.js";
import { LlmError } from "./errors.js";

function fakeClient(create: (params: unknown) => unknown): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

test("complete() converts messages, tools and the response", async () => {
  let sentParams: unknown;
  const client = fakeClient((params) => {
    sentParams = params;

    return {
      content: [
        { type: "text", text: "Checking" },
        { type: "tool_use", id: "t1", name: "list_events", input: { day: "today" } },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: null,
      },
    };
  });
  const provider = new AnthropicProvider(client, { model: "m", maxTokens: 100, effort: "low" });

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
      { type: "tool_call", id: "t1", name: "list_events", input: { day: "today" } },
    ],
    stopReason: "tool_use",
    // Cache tokens are counted as full-price input; see the provider's comment.
    usage: { inputTokens: 110, outputTokens: 5 },
  });
  assert.deepEqual(sentParams, {
    model: "m",
    max_tokens: 100,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    system: "sys",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "tool_use", id: "t0", name: "x", input: {} }] },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t0", content: "ok", is_error: false }],
      },
    ],
    tools: [{ name: "list_events", description: "d", input_schema: { type: "object", properties: {} } }],
  });
});

test("complete() maps SDK errors to LlmError kinds", async () => {
  const headers = new Headers();
  const cases: [string, Error, string][] = [
    [
      "insufficient credits",
      new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low." } },
        undefined,
        headers,
      ),
      "insufficient_credits",
    ],
    [
      "other 400s",
      new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "bad request" } },
        undefined,
        headers,
      ),
      "unknown",
    ],
    ["auth", new Anthropic.AuthenticationError(401, {}, "bad key", headers), "auth"],
    ["rate limit", new Anthropic.RateLimitError(429, {}, "slow down", headers), "rate_limit"],
  ];

  for (const [label, sdkError, expectedKind] of cases) {
    const client = fakeClient(() => {
      throw sdkError;
    });
    const provider = new AnthropicProvider(client, { model: "m", maxTokens: 1 });

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

