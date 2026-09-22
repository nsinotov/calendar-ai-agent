import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "../logging/index.js";
import { LlmError } from "./errors.js";
import { LoggingLlmProvider } from "./logging-provider.js";
import type { LlmProvider } from "./types.js";

function fakeLogger(): Logger & { calls: [string, string, Record<string, unknown> | undefined][] } {
  const calls: [string, string, Record<string, unknown> | undefined][] = [];

  return {
    calls,
    error: (message, context) => calls.push(["error", message, context]),
    warn: (message, context) => calls.push(["warn", message, context]),
    info: (message, context) => calls.push(["info", message, context]),
    debug: (message, context) => calls.push(["debug", message, context]),
  };
}

test("logs a request/response pair on success", async () => {
  const inner: LlmProvider = {
    complete: async () => ({
      content: [
        { type: "text", text: "hi" },
        { type: "tool_call", id: "1", name: "list_events", input: {} },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 5, outputTokens: 2 },
    }),
  };
  const logger = fakeLogger();
  const provider = new LoggingLlmProvider(inner, logger);

  await provider.complete({ system: "s", messages: [], tools: [] });

  const levels = logger.calls.map(([level]) => level);
  assert.deepEqual(levels, ["debug", "info", "debug"]);

  const [, , infoContext] = logger.calls[1];
  assert.equal(infoContext?.stopReason, "tool_use");
  assert.deepEqual(infoContext?.toolCalls, ["list_events"]);
});

test("logs and rethrows on failure", async () => {
  const inner: LlmProvider = {
    complete: async () => {
      throw new LlmError("insufficient_credits", "no money");
    },
  };
  const logger = fakeLogger();
  const provider = new LoggingLlmProvider(inner, logger);

  await assert.rejects(
    provider.complete({ system: "", messages: [], tools: [] }),
    (error: unknown) => error instanceof LlmError && error.kind === "insufficient_credits",
  );

  const [level, message, context] = logger.calls.at(-1)!;
  assert.equal(level, "error");
  assert.equal(message, "llm.error");
  assert.equal(context?.kind, "insufficient_credits");
});

