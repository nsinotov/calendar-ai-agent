import assert from "node:assert/strict";
import { test } from "node:test";
import { LlmError } from "../llm/errors.js";
import type { LlmProvider, LlmResponse } from "../llm/types.js";
import { BillingLlmProvider } from "./billing-llm-provider.js";
import type { BillingService } from "./billing-service.js";

const response: LlmResponse = {
  content: [{ type: "text", text: "hi" }],
  stopReason: "end_turn",
  usage: { inputTokens: 1, outputTokens: 2 },
};

function fakeBilling() {
  const events: string[] = [];
  const billing = {
    recordSuccess: () => events.push("success"),
    recordFailure: () => events.push("failure"),
  } as unknown as BillingService;

  return { billing, events };
}

test("a successful call is recorded and returned unchanged", async () => {
  const { billing, events } = fakeBilling();
  const inner: LlmProvider = { complete: async () => response };

  assert.equal(await new BillingLlmProvider(inner, billing).complete({ system: "", messages: [], tools: [] }), response);
  assert.deepEqual(events, ["success"]);
});

test("a failure is recorded and rethrown", async () => {
  const { billing, events } = fakeBilling();
  const inner: LlmProvider = {
    complete: async () => {
      throw new LlmError("insufficient_credits", "no credits");
    },
  };

  await assert.rejects(new BillingLlmProvider(inner, billing).complete({ system: "", messages: [], tools: [] }), /no credits/);
  assert.deepEqual(events, ["failure"]);
});

