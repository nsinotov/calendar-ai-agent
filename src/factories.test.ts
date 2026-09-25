import assert from "node:assert/strict";
import { test } from "node:test";
import { createStorage } from "./db/index.js";
import { createLlmProvider } from "./llm/index.js";
import { createLogger, type Logger } from "./logging/index.js";
import { createMessagingProvider } from "./messaging/index.js";

const logger: Logger = { error() {}, warn() {}, info() {}, debug() {} };

test("factories reject an unknown provider identifier", () => {
  assert.throws(
    () => createStorage({ provider: "nope", dataDir: "./unused", encryptionKeyHex: "0".repeat(64) }),
    /Unknown storage provider: "nope"/,
  );
  assert.throws(
    () => createLlmProvider({ provider: "nope", apiKey: "k", model: "m", maxTokens: 1 }, logger),
    /Unknown LLM provider: "nope"/,
  );
  assert.throws(
    () => createMessagingProvider({ provider: "nope" }, logger),
    /Unknown messaging provider: "nope"/,
  );
  assert.throws(
    () => createLogger({ providers: ["nope"], levels: ["error"], debugEnabled: false, dir: "./unused", retentionDays: 1 }),
    /Unknown log provider: "nope"/,
  );
});

test("the Telegram provider requires a bot token", () => {
  assert.throws(() => createMessagingProvider({ provider: "telegram" }, logger), /bot token/);
});

