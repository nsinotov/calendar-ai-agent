import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../calendar/index.js";
import { formatDailySummary, formatEventReminder, formatLateEventReminder, formatWeeklySummary } from "./format.js";

const dentist: CalendarEvent = {
  id: "1",
  title: "Dentist",
  location: "Clinic",
  start: { allDay: false, value: "2026-09-25T09:00:00+03:00" },
  end: { allDay: false, value: "2026-09-25T09:30:00+03:00" },
  status: "confirmed",
};
const holiday: CalendarEvent = {
  id: "2",
  title: "Holiday",
  start: { allDay: true, value: "2026-09-26" },
  end: { allDay: true, value: "2026-09-27" },
  status: "confirmed",
};

test("the daily summary lists local times and places", () => {
  assert.equal(formatDailySummary([dentist, holiday], "Europe/Kyiv"), "Your events for today:\n- 09:00-09:30: Dentist (Clinic)\n- all day: Holiday");
});

test("the weekly summary groups events by local date", () => {
  assert.equal(
    formatWeeklySummary([dentist, holiday], "Europe/Kyiv"),
    "Your events for the coming week:\n\n2026-09-25:\n- 09:00-09:30: Dentist (Clinic)\n\n2026-09-26:\n- all day: Holiday",
  );
});

test("the event reminder names the title, start time and remaining minutes", () => {
  assert.equal(formatEventReminder(dentist, 60, "Europe/Kyiv"), 'Reminder: "Dentist" starts at 09:00 (in 60 min). Place: Clinic.');
});


test("empty periods produce a plain nothing-planned text", () => {
  assert.equal(formatDailySummary([], "Europe/Kyiv"), "You have no events today.");
  assert.equal(formatWeeklySummary([], "Europe/Kyiv"), "You have no events for the coming week.");
});

test("the late reminder apologizes and still names the event and the remaining minutes", () => {
  assert.equal(
    formatLateEventReminder(dentist, 1, "Europe/Kyiv"),
    'I apologize for the delay, there was an issue on my side. But you have "Dentist" starting at 09:00 (in 1 min). Place: Clinic.',
  );
});
