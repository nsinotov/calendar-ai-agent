import assert from "node:assert/strict";
import { test } from "node:test";
import { splitMessage } from "./split-message.js";

test("short text stays a single chunk", () => {
  assert.deepEqual(splitMessage("hello", 10), ["hello"]);
});

test("empty text gives no chunks", () => {
  assert.deepEqual(splitMessage("", 10), []);
});

test("long text is cut at the last line break within the limit", () => {
  assert.deepEqual(splitMessage("aaaa\nbbbb\ncccc", 10), ["aaaa\nbbbb", "cccc"]);
});

test("text without line breaks is cut at the limit", () => {
  assert.deepEqual(splitMessage("abcdefghij", 4), ["abcd", "efgh", "ij"]);
});

test("no chunk exceeds the limit", () => {
  const text = "word ".repeat(50).trim().split(" ").join("\n");

  for (const chunk of splitMessage(text, 12)) {
    assert.ok(chunk.length <= 12);
  }
});

