import assert from "node:assert/strict";
import { test } from "node:test";
import { canUse, createCommands, parseCommand } from "./commands.js";

const commands = createCommands({
  conversations: { append() {}, load: () => [], clear() {} },
  billing: {} as never,
  llm: {} as never,
  languageOf: () => "en",
});

test("parseCommand() splits the name and arguments and ignores the bot suffix", () => {
  assert.deepEqual(parseCommand("/setbalance@my_bot  20 "), { name: "setbalance", args: "20" });
  assert.deepEqual(parseCommand("/CLEAR"), { name: "clear", args: "" });
});

test("parseCommand() returns null for ordinary text", () => {
  assert.equal(parseCommand("hello /clear"), null);
  assert.equal(parseCommand("what's next?"), null);
});

test("admins can use every command, users only the user-level ones", () => {
  const names = (role: "admin" | "user") => commands.filter((command) => canUse(role, command)).map((command) => command.name);

  assert.deepEqual(names("user"), ["clear"]);
  assert.deepEqual(names("admin"), ["clear", "balance", "setbalance"]);
});

