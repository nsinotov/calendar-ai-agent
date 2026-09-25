import assert from "node:assert/strict";
import { test } from "node:test";
import { AlertLogProvider } from "./alert-provider.js";
import type { LogEntry, LogLevel } from "./types.js";

function entry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  return { timestamp: "t", level, message, ...(context && { context }) };
}

function setup(now: () => number = () => 0) {
  const sent: string[] = [];
  const provider = new AlertLogProvider(1000, now);
  provider.connect(async (text) => void sent.push(text));

  return { provider, sent };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("an error entry becomes an alert with the event name and kind only", async () => {
  const { provider, sent } = setup();

  provider.write(entry("error", "llm.error", { kind: "auth", message: "secret user text" }));
  await flush();

  assert.deepEqual(sent, ["System error: llm.error [auth]. See the server logs."]);
});

test("non-error entries do not alert", async () => {
  const { provider, sent } = setup();

  provider.write(entry("warn", "x"));
  provider.write(entry("info", "y"));
  await flush();

  assert.deepEqual(sent, []);
});

test("repeats of the same event inside the window are counted, then reported later", async () => {
  let time = 0;
  const { provider, sent } = setup(() => time);

  provider.write(entry("error", "calendar.listEvents"));
  await flush();
  provider.write(entry("error", "calendar.listEvents"));
  provider.write(entry("error", "calendar.listEvents"));
  await flush();
  assert.equal(sent.length, 1);

  time = 1000;
  provider.write(entry("error", "calendar.listEvents"));
  await flush();

  assert.equal(sent.length, 2);
  assert.match(sent[1]!, /2 similar errors/);
});

test("different events alert independently", async () => {
  const { provider, sent } = setup();

  provider.write(entry("error", "a"));
  await flush();
  provider.write(entry("error", "b"));
  await flush();

  assert.equal(sent.length, 2);
});

test("errors logged while an alert is being sent do not trigger another alert", async () => {
  const sent: string[] = [];
  const provider = new AlertLogProvider(1000);
  provider.connect(async (text) => {
    sent.push(text);
    provider.write(entry("error", "messaging.send"));
  });

  provider.write(entry("error", "first"));
  await flush();

  assert.equal(sent.length, 1);
});

test("entries are dropped until a sink is connected", async () => {
  const provider = new AlertLogProvider();

  assert.doesNotThrow(() => provider.write(entry("error", "early")));
});

