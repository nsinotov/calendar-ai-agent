import assert from "node:assert/strict";
import { test } from "node:test";
import { createStorage } from "../db/index.js";
import type { CalendarProvider } from "../calendar/index.js";
import type { LlmProvider } from "../llm/types.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentContextBuilder } from "./agent-context.js";

const calendar = {} as CalendarProvider;
const llm = {} as LlmProvider;

function build(options: { calendar: CalendarProvider | null; suggestionsEnabled: boolean }): string[] {
  const dataDir = mkdtempSync(join(tmpdir(), "context-"));
  const storage = createStorage({ provider: "sqlite", dataDir, encryptionKeyHex: "0".repeat(64) });

  try {
    storage.users.upsert(1, "user");
    const context = createAgentContextBuilder({
      storage,
      llm,
      resolveCalendar: () => options.calendar,
      allowedTopics: [],
      suggestionsEnabled: options.suggestionsEnabled,
    })(1);

    return context.tools.map((tool) => tool.definition.name);
  } finally {
    storage.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

test("without a calendar the calendar tools are absent", () => {
  const names = build({ calendar: null, suggestionsEnabled: false });

  assert.ok(!names.includes("list_events"));
  assert.ok(names.includes("add_note"));
  assert.ok(names.includes("get_capabilities"));
});

test("with a calendar the calendar tools are present", () => {
  assert.ok(build({ calendar, suggestionsEnabled: false }).includes("list_events"));
});

test("get_suggestions is registered only when the flag is on", () => {
  assert.ok(!build({ calendar, suggestionsEnabled: false }).includes("get_suggestions"));
  assert.ok(build({ calendar, suggestionsEnabled: true }).includes("get_suggestions"));
});

