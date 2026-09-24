import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CalendarEvent, CalendarProvider, ListEventsOptions } from "../calendar/index.js";
import { SCHEMA } from "../db/database.js";
import type { LlmProvider, LlmRequest } from "../llm/types.js";
import { SqliteActivityMemoryStore } from "../memory/activity-memory-store.js";
import { SqliteNotesProvider } from "../notes/sqlite-provider.js";
import { refreshActivitySummary } from "./activity.js";
import { createSuggestionTools } from "./suggestion-tools.js";

const usage = { inputTokens: 0, outputTokens: 0 };
const NOW = new Date("2026-09-24T12:00:00Z");

const dentist: CalendarEvent = {
  id: "e1",
  title: "Dentist",
  start: { allDay: false, value: "2026-09-17T10:00:00Z" },
  end: { allDay: false, value: "2026-09-17T11:00:00Z" },
  status: "confirmed",
};

function setup(reply: string, events: CalendarEvent[] = []) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  const requests: LlmRequest[] = [];
  const ranges: ListEventsOptions[] = [];
  const llm: LlmProvider = {
    async complete(request) {
      requests.push(request);

      return { content: [{ type: "text", text: reply }], stopReason: "end_turn", usage };
    },
  };
  const calendar: CalendarProvider = {
    async listEvents(options) {
      ranges.push(options);

      return options.timeMax === NOW.toISOString() ? events : [];
    },
    async createEvent() {
      throw new Error("not used");
    },
    async updateEvent() {
      throw new Error("not used");
    },
    async deleteEvent() {
      throw new Error("not used");
    },
  };

  return {
    deps: { llm, calendar, notes: new SqliteNotesProvider(db), store: new SqliteActivityMemoryStore(db) },
    requests,
    ranges,
  };
}

test("refreshActivitySummary() rewrites the stored summary from the previous one and fresh data", async () => {
  const { deps, requests } = setup("Saw the dentist on 17 Sept; needs to buy milk.", [dentist]);
  deps.store.set(1, "Old summary about a trip.");
  deps.notes.add(1, { text: "milk", context: "market" });

  const summary = await refreshActivitySummary(deps, 1, NOW);
  const prompt = requests[0]?.messages[0]?.content;

  assert.equal(summary, "Saw the dentist on 17 Sept; needs to buy milk.");
  assert.equal(deps.store.get(1), summary);
  assert.ok(typeof prompt === "string");
  assert.match(prompt, /Old summary about a trip\./);
  assert.match(prompt, /Dentist/);
  assert.match(prompt, /\[market\] milk/);
});

test("refreshActivitySummary() clears the memory without calling the LLM when there is no data", async () => {
  const { deps, requests } = setup("unused");
  deps.store.set(1, "Stale.");

  assert.equal(await refreshActivitySummary(deps, 1, NOW), null);
  assert.equal(deps.store.get(1), null);
  assert.equal(requests.length, 0);
});

test("refreshActivitySummary() only reads the given user's notes", async () => {
  const { deps, requests } = setup("Summary.", []);
  deps.notes.add(2, { text: "someone else's secret" });

  assert.equal(await refreshActivitySummary(deps, 1, NOW), null);
  assert.equal(requests.length, 0);
});

test("get_suggestions returns parsed suggestions capped at three", async () => {
  const { deps } = setup("1. Did you buy the milk?\n- How was the dentist?\n\n* Add a re-check?\nExtra one", [dentist]);
  const [tool] = createSuggestionTools({ ...deps, userId: 1, language: "en", now: () => NOW });

  const result = JSON.parse(await tool!.execute({})) as { suggestions: string[] };

  assert.deepEqual(result.suggestions, ["Did you buy the milk?", "How was the dentist?", "Add a re-check?"]);
});

test("get_suggestions returns an empty list when the model has nothing to suggest", async () => {
  const { deps } = setup("");
  const [tool] = createSuggestionTools({ ...deps, userId: 1, language: "en", now: () => NOW });

  assert.equal(await tool!.execute({}), '{"suggestions":[]}');
});

