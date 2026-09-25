import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { SqliteEventReminderStore } from "../memory/event-reminder-store.js";
import { createReminderTools, MAX_REMINDER_MINUTES } from "./reminder-tools.js";
import type { Tool } from "./tool.js";

function setup(): { tools: Tool[]; store: SqliteEventReminderStore } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();
  const store = new SqliteEventReminderStore(db);

  return { tools: createReminderTools(store, 1), store };
}

function find(tools: Tool[], name: string): Tool {
  return tools.find((tool) => tool.definition.name === name)!;
}

test("set_event_reminder stores the lead time for the calling user only", async () => {
  const { tools, store } = setup();

  await find(tools, "set_event_reminder").execute({ eventId: "e1", minutesBefore: 120 });

  assert.equal(store.get(1, "e1"), 120);
  assert.equal(store.get(2, "e1"), null);
});

test("set_event_reminder rejects lead times outside the supported range", async () => {
  const { tools } = setup();
  const tool = find(tools, "set_event_reminder");

  await assert.rejects(tool.execute({ eventId: "e1", minutesBefore: 0 }), /Invalid arguments/);
  await assert.rejects(tool.execute({ eventId: "e1", minutesBefore: MAX_REMINDER_MINUTES + 1 }), /Invalid arguments/);
});

test("remove_event_reminder reports whether a reminder existed", async () => {
  const { tools, store } = setup();
  store.set(1, "e1", 60);
  const tool = find(tools, "remove_event_reminder");

  assert.deepEqual(JSON.parse(await tool.execute({ eventId: "e1" })), { removed: true });
  assert.deepEqual(JSON.parse(await tool.execute({ eventId: "e1" })), { removed: false });
});

