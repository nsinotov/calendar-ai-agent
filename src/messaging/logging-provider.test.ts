import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "../logging/index.js";
import { LoggingMessagingProvider } from "./logging-provider.js";
import type { MessageHandler, MessagingProvider } from "./types.js";

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

function fakeInner(): MessagingProvider & { handler: MessageHandler | null } {
  return {
    handler: null,
    onMessage(handler) {
      this.handler = handler;
    },
    send: async () => {},
    start: async () => {},
    stop: async () => {},
  };
}

test("incoming messages log metadata at info and text at debug only", async () => {
  const inner = fakeInner();
  const logger = fakeLogger();
  new LoggingMessagingProvider(inner, logger).onMessage(async () => {});

  await inner.handler!({ userId: 1, text: "secret note" });

  const info = logger.calls.find(([level]) => level === "info")!;
  assert.equal(info[2]?.length, 11);
  assert.ok(!("text" in (info[2] ?? {})), "info log must not carry message text");
  assert.ok(logger.calls.some(([level, , context]) => level === "debug" && context?.text === "secret note"));
});

test("a failing handler is logged and does not throw", async () => {
  const inner = fakeInner();
  const logger = fakeLogger();
  new LoggingMessagingProvider(inner, logger).onMessage(async () => {
    throw new Error("boom");
  });

  await inner.handler!({ userId: 1, text: "hi" });

  const [level, , context] = logger.calls.at(-1)!;
  assert.equal(level, "error");
  assert.equal(context?.message, "boom");
});

test("send() failure is logged and rethrown", async () => {
  const inner: MessagingProvider = {
    ...fakeInner(),
    send: async () => {
      throw new Error("blocked");
    },
  };
  const logger = fakeLogger();
  const provider = new LoggingMessagingProvider(inner, logger);

  await assert.rejects(provider.send(1, "hi"), /blocked/);
  assert.equal(logger.calls.at(-1)![0], "error");
});

test("send() logs the text at debug only", async () => {
  const logger = fakeLogger();
  await new LoggingMessagingProvider(fakeInner(), logger).send(1, "hello");

  const info = logger.calls.find(([level]) => level === "info")!;
  assert.ok(!("text" in (info[2] ?? {})));
});

