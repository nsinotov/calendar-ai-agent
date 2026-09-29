import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CalendarEvent, CalendarProvider, EventInput } from "../calendar/index.js";
import { SCHEMA } from "../db/database.js";
import { SqlitePreferencesStore } from "../memory/preferences-store.js";
import { SqliteNotesProvider } from "../notes/sqlite-provider.js";
import { createCalendarTools } from "./calendar-tools.js";
import { createNotesTools } from "./notes-tools.js";
import { createPreferencesTools } from "./preferences-tools.js";
import type { Tool } from "./tool.js";

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.definition.name === name);
  assert.ok(tool, `tool ${name} not found`);

  return tool;
}

function fakeCalendar(
  events: CalendarEvent[] = [],
  options: { undeletable?: string[] } = {},
): {
  calendar: CalendarProvider;
  created: EventInput[];
  updates: { id: string; input: Partial<EventInput> }[];
  deleted: string[];
  deleteAttempts: string[];
} {
  const created: EventInput[] = [];
  const updates: { id: string; input: Partial<EventInput> }[] = [];
  const deleted: string[] = [];
  const deleteAttempts: string[] = [];
  const undeletable = options.undeletable ?? [];
  const calendar: CalendarProvider = {
    async listEvents() {
      return events;
    },
    async createEvent(input) {
      created.push(input);

      return { id: "new", status: "confirmed", ...input };
    },
    async updateEvent(id, input) {
      updates.push({ id, input });

      return { ...events[0]!, id, ...input };
    },
    async deleteEvent(id) {
      deleteAttempts.push(id);
      if (undeletable.includes(id)) {
        throw new Error("not valid for this event type");
      }
      deleted.push(id);
    },
    canDelete(event) {
      return event.eventType !== "birthday";
    },
  };

  return { calendar, created, updates, deleted, deleteAttempts };
}

function event(id: string, start: CalendarEvent["start"], end: CalendarEvent["end"], eventType?: string): CalendarEvent {
  return { id, title: id, start, end, status: "confirmed", eventType };
}

const NOW = new Date("2026-09-24T12:00:00Z");

test("create_event maps a plain date to an all-day event and a date-time to a timed one", async () => {
  const { calendar, created } = fakeCalendar();
  const tools = createCalendarTools(calendar, { timezone: "UTC" });

  await findTool(tools, "create_event").execute({
    title: "Holiday",
    start: "2026-10-01",
    end: "2026-10-02",
  });
  await findTool(tools, "create_event").execute({
    title: "Call",
    start: "2026-10-01T10:00:00+03:00",
    end: "2026-10-01T11:00:00+03:00",
  });

  assert.deepEqual(created[0]?.start, { allDay: true, value: "2026-10-01" });
  assert.deepEqual(created[1]?.end, { allDay: false, value: "2026-10-01T11:00:00+03:00" });
});

test("create_event rejects a date-time without a UTC offset", async () => {
  const { calendar } = fakeCalendar();
  const tools = createCalendarTools(calendar, { timezone: "UTC" });

  await assert.rejects(
    findTool(tools, "create_event").execute({ title: "Call", start: "2026-10-01T10:00:00", end: "2026-10-01T11:00:00" }),
    /Invalid arguments/,
  );
});

test("update_event sends only the provided fields", async () => {
  const { calendar, updates } = fakeCalendar([event("e1", { allDay: true, value: "2026-10-01" }, { allDay: true, value: "2026-10-02" })]);
  const tools = createCalendarTools(calendar, { timezone: "UTC" });

  await findTool(tools, "update_event").execute({ id: "e1", title: "Renamed" });

  assert.deepEqual(updates, [{ id: "e1", input: { title: "Renamed" } }]);
});

test("delete_old_events deletes only events that have already ended", async () => {
  const { calendar, deleted } = fakeCalendar([
    event("past-timed", { allDay: false, value: "2026-09-24T08:00:00Z" }, { allDay: false, value: "2026-09-24T09:00:00Z" }),
    event("running", { allDay: false, value: "2026-09-24T11:00:00Z" }, { allDay: false, value: "2026-09-24T13:00:00Z" }),
    event("past-allday", { allDay: true, value: "2026-09-22" }, { allDay: true, value: "2026-09-23" }),
    event("today-allday", { allDay: true, value: "2026-09-24" }, { allDay: true, value: "2026-09-25" }),
  ]);
  const tools = createCalendarTools(calendar, { timezone: "UTC", now: () => NOW });

  const result = await findTool(tools, "delete_old_events").execute({});

  assert.deepEqual(deleted, ["past-timed", "past-allday"]);
  assert.equal(result, '{"deleted":2,"skipped":0}');
});

test("delete_old_events skips events the provider refuses to delete and continues with the rest", async () => {
  const { calendar, deleted } = fakeCalendar(
    [
      event("past-timed", { allDay: false, value: "2026-09-24T08:00:00Z" }, { allDay: false, value: "2026-09-24T09:00:00Z" }),
      event("past-birthday", { allDay: true, value: "2026-09-22" }, { allDay: true, value: "2026-09-23" }),
    ],
    { undeletable: ["past-birthday"] },
  );
  const tools = createCalendarTools(calendar, { timezone: "UTC", now: () => NOW });

  const result = await findTool(tools, "delete_old_events").execute({});

  assert.deepEqual(deleted, ["past-timed"]);
  assert.equal(result, '{"deleted":1,"skipped":1}');
});

test("delete_old_events skips a known non-deletable eventType without even attempting the call", async () => {
  const { calendar, deleted, deleteAttempts } = fakeCalendar([
    event("past-timed", { allDay: false, value: "2026-09-24T08:00:00Z" }, { allDay: false, value: "2026-09-24T09:00:00Z" }),
    event("past-birthday", { allDay: true, value: "2026-09-22" }, { allDay: true, value: "2026-09-23" }, "birthday"),
  ]);
  const tools = createCalendarTools(calendar, { timezone: "UTC", now: () => NOW });

  const result = await findTool(tools, "delete_old_events").execute({});

  assert.deepEqual(deleted, ["past-timed"]);
  assert.deepEqual(deleteAttempts, ["past-timed"]);
  assert.equal(result, '{"deleted":1,"skipped":1}');
});

test("delete_old_events uses the user's timezone for all-day events", async () => {
  const { calendar, deleted } = fakeCalendar([
    event("yesterday", { allDay: true, value: "2026-09-23" }, { allDay: true, value: "2026-09-24" }),
  ]);
  const evening = new Date("2026-09-24T02:00:00Z");
  const losAngeles = createCalendarTools(calendar, { timezone: "America/Los_Angeles", now: () => evening });
  const tokyo = createCalendarTools(calendar, { timezone: "Asia/Tokyo", now: () => evening });

  await findTool(losAngeles, "delete_old_events").execute({});
  assert.deepEqual(deleted, []);

  await findTool(tokyo, "delete_old_events").execute({});
  assert.deepEqual(deleted, ["yesterday"]);
});

function notesTools(): { tools: Tool[]; db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return { tools: createNotesTools(new SqliteNotesProvider(db), 1), db };
}

test("notes tools add, list, remove and remove all for the bound user", async () => {
  const { tools, db } = notesTools();
  db.prepare("INSERT INTO notes (telegram_user_id, text, context, created_at) VALUES (2, 'other', NULL, 0)").run();

  await findTool(tools, "add_note").execute({ text: "milk", context: "market" });
  await findTool(tools, "add_note").execute({ text: "rent" });
  const listed = JSON.parse(await findTool(tools, "list_notes").execute({ query: "market" })) as { text: string }[];

  assert.deepEqual(listed.map((note) => note.text), ["milk"]);
  assert.equal(await findTool(tools, "remove_note").execute({ id: 999 }), '{"removed":false}');
  assert.equal(await findTool(tools, "remove_all_notes").execute({}), '{"removed":2}');
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n, 1);
});

test("preferences tools add, update and remove the bound user's preferences", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();
  const store = new SqlitePreferencesStore(db);
  store.add(2, "Other user's rule");
  const tools = createPreferencesTools(store, 1);

  const added = JSON.parse(await findTool(tools, "add_preference").execute({ text: "Delete without asking." })) as { id: number };
  assert.equal(await findTool(tools, "update_preference").execute({ id: added.id, text: "Ask before deleting." }), '{"updated":true}');
  assert.deepEqual(store.list(1), [{ id: added.id, text: "Ask before deleting." }]);

  assert.equal(await findTool(tools, "remove_preference").execute({ id: added.id }), '{"removed":true}');
  assert.equal(await findTool(tools, "remove_preference").execute({ id: 999 }), '{"removed":false}');
  assert.equal(store.list(2).length, 1);
});

test("add_preference rejects text longer than the limit", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();
  const tools = createPreferencesTools(new SqlitePreferencesStore(db), 1);

  await assert.rejects(findTool(tools, "add_preference").execute({ text: "x".repeat(301) }), /Invalid arguments/);
});

