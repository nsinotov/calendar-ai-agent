import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CalendarEvent, CalendarProvider, ListEventsOptions } from "../../calendar/index.js";
import { SCHEMA } from "../../db/database.js";
import type { LlmProvider } from "../../llm/types.js";
import { SqliteEventReminderStore } from "../../memory/event-reminder-store.js";
import { SqliteSentStore } from "../../memory/sent-store.js";
import { SqliteUserSettingsStore, type UserSettings } from "../../memory/user-settings-store.js";
import type { JobContext } from "../types.js";
import { createCleanupJob } from "./cleanup-job.js";
import { createEventReminderJob } from "./event-reminder-job.js";
import { createSummaryJob } from "./summary-job.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();
  const settingsStore = new SqliteUserSettingsStore(db);
  const sent = new SqliteSentStore(db);
  const reminders = new SqliteEventReminderStore(db);
  const messages: [number, string][] = [];
  const send = async (userId: number, text: string) => void messages.push([userId, text]);

  return { settingsStore, sent, reminders, messages, send };
}

// English needs no translation, so the LLM is never called.
const noLlm = {} as LlmProvider;

function timed(id: string, title: string, start: string, minutes = 30): CalendarEvent {
  const end = new Date(Date.parse(start) + minutes * 60_000).toISOString();

  return { id, title, start: { allDay: false, value: start }, end: { allDay: false, value: end }, status: "confirmed" };
}

function fakeCalendar(events: CalendarEvent[]): CalendarProvider & { listCalls: ListEventsOptions[]; deleted: string[] } {
  const listCalls: ListEventsOptions[] = [];
  const deleted: string[] = [];

  return {
    listCalls,
    deleted,
    listEvents: async (options) => {
      listCalls.push(options);

      return events;
    },
    createEvent: async () => events[0]!,
    updateEvent: async () => events[0]!,
    deleteEvent: async (id) => void deleted.push(id),
  };
}

function context(calendar: CalendarProvider, settings: UserSettings, now: string, userId = 1): JobContext {
  return { userId, settings, calendar, now: new Date(now) };
}

function english(settings: UserSettings): UserSettings {
  return { ...settings, language: "en", timezone: "UTC" };
}

test("the daily summary is sent once at the user's time and lists the day's events", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const settings = english(settingsStore.get(1));
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T09:00:00Z")]);
  const job = createSummaryJob({ kind: "daily", sent, send, llm: noLlm });

  await job.run(context(calendar, settings, "2026-09-25T08:05:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T08:06:00Z"));

  assert.equal(messages.length, 1);
  assert.match(messages[0]![1], /09:00-09:30: Dentist/);
});

test("the daily summary waits for its time and skips a day that is long past", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const settings = english(settingsStore.get(1));
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T09:00:00Z")]);
  const job = createSummaryJob({ kind: "daily", sent, send, llm: noLlm });

  await job.run(context(calendar, settings, "2026-09-25T07:59:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T10:30:00Z"));

  assert.equal(messages.length, 0);
});

test("the daily summary is skipped when disabled", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const job = createSummaryJob({ kind: "daily", sent, send, llm: noLlm });

  await job.run(context(fakeCalendar([timed("e1", "x", "2026-09-25T09:00:00Z")]), { ...english(settingsStore.get(1)), dailyReminderEnabled: false }, "2026-09-25T08:05:00Z"));

  assert.equal(messages.length, 0);
});

test("an empty day still gets a message saying there is nothing planned, once", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const settings = english(settingsStore.get(1));
  const job = createSummaryJob({ kind: "daily", sent, send, llm: noLlm });

  await job.run(context(fakeCalendar([]), settings, "2026-09-25T08:05:00Z"));
  await job.run(context(fakeCalendar([]), settings, "2026-09-25T08:06:00Z"));

  assert.deepEqual(messages, [[1, "You have no events today."]]);
});

test("the weekly summary is sent only on the user's first day of the week", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const settings = english(settingsStore.get(1));
  const calendar = fakeCalendar([timed("e1", "Standup", "2026-09-29T09:00:00Z")]);
  const job = createSummaryJob({ kind: "weekly", sent, send, llm: noLlm });

  await job.run(context(calendar, settings, "2026-09-28T08:05:00Z")); // Monday
  await job.run(context(calendar, settings, "2026-09-29T08:05:00Z")); // Tuesday

  assert.equal(messages.length, 1);
  assert.match(messages[0]![1], /coming week/);
});

test("suggestions are appended to the summary", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T09:00:00Z")]);
  const job = createSummaryJob({ kind: "daily", sent, send, llm: noLlm, suggestions: async () => ["Did you buy milk?"] });

  await job.run(context(calendar, english(settingsStore.get(1)), "2026-09-25T08:05:00Z"));

  assert.match(messages[0]![1], /Dentist[\s\S]*Did you buy milk\?/);
});

test("a failing suggestions call does not stop the summary", async () => {
  const { settingsStore, sent, messages, send } = setup();
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T09:00:00Z")]);
  const job = createSummaryJob({
    kind: "daily",
    sent,
    send,
    llm: noLlm,
    suggestions: async () => {
      throw new Error("llm down");
    },
  });

  await job.run(context(calendar, english(settingsStore.get(1)), "2026-09-25T08:05:00Z"));

  assert.equal(messages.length, 1);
});

function reminderJob(deps: ReturnType<typeof setup>) {
  return createEventReminderJob({ sent: deps.sent, reminders: deps.reminders, send: deps.send, llm: noLlm, pollMinutes: 15, tickMs: 60_000 });
}

test("an event reminder is sent once, at the default lead time", async () => {
  const deps = setup();
  const settings = english(deps.settingsStore.get(1));
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T10:00:00Z")]);
  const job = reminderJob(deps);

  await job.run(context(calendar, settings, "2026-09-25T08:30:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T09:00:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T09:01:00Z"));

  assert.equal(deps.messages.length, 1);
  assert.match(deps.messages[0]![1], /"Dentist" starts at 10:00 \(in 60 min\)/);
});

test("a custom reminder overrides the default lead time and works with default reminders off", async () => {
  const deps = setup();
  const settings = { ...english(deps.settingsStore.get(1)), eventReminderEnabled: false };
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T10:00:00Z"), timed("e2", "Other", "2026-09-25T10:00:00Z")]);
  deps.reminders.set(1, "e1", 120);
  const job = reminderJob(deps);

  await job.run(context(calendar, settings, "2026-09-25T08:00:00Z"));

  assert.equal(deps.messages.length, 1);
  assert.match(deps.messages[0]![1], /Dentist/);
});

test("a reminder whose time already passed long ago is not sent late", async () => {
  const deps = setup();
  const calendar = fakeCalendar([timed("e1", "Dentist", "2026-09-25T10:00:00Z")]);

  await reminderJob(deps).run(context(calendar, english(deps.settingsStore.get(1)), "2026-09-25T09:40:00Z"));

  assert.equal(deps.messages.length, 0);
});

test("all-day events get no reminder", async () => {
  const deps = setup();
  const allDay: CalendarEvent = { id: "a", title: "Holiday", start: { allDay: true, value: "2026-09-25" }, end: { allDay: true, value: "2026-09-26" }, status: "confirmed" };

  await reminderJob(deps).run(context(fakeCalendar([allDay]), english(deps.settingsStore.get(1)), "2026-09-24T23:30:00Z"));

  assert.equal(deps.messages.length, 0);
});

test("the calendar is fetched once per poll interval, not on every tick", async () => {
  const deps = setup();
  const settings = english(deps.settingsStore.get(1));
  const calendar = fakeCalendar([]);
  const job = reminderJob(deps);

  await job.run(context(calendar, settings, "2026-09-25T08:00:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T08:05:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T08:16:00Z"));

  assert.equal(calendar.listCalls.length, 2);
});

test("cleanup deletes only events that ended before the retention period, once a day", async () => {
  const deps = setup();
  const settings = { ...english(deps.settingsStore.get(1)), oldEventsAction: "delete" as const, oldEventsRetentionDays: 30 };
  const old = timed("old", "Old", "2026-08-01T10:00:00Z");
  const recent = timed("recent", "Recent", "2026-09-20T10:00:00Z");
  const calendar = fakeCalendar([old, recent]);
  const job = createCleanupJob({ sent: deps.sent, reminders: deps.reminders });

  await job.run(context(calendar, settings, "2026-09-25T03:10:00Z"));
  await job.run(context(calendar, settings, "2026-09-25T04:00:00Z"));

  assert.deepEqual(calendar.deleted, ["old"]);
});

test("cleanup with the keep policy deletes nothing", async () => {
  const deps = setup();
  const calendar = fakeCalendar([timed("old", "Old", "2026-01-01T10:00:00Z")]);

  await createCleanupJob({ sent: deps.sent, reminders: deps.reminders }).run(context(calendar, english(deps.settingsStore.get(1)), "2026-09-25T03:10:00Z"));

  assert.deepEqual(calendar.deleted, []);
});

