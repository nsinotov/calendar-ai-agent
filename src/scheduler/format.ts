import type { CalendarEvent } from "../calendar/index.js";
import { localParts } from "./local-time.js";

// Plain English drafts; the scheduler translates them into the user's language.

function timeRange(event: CalendarEvent, timezone: string): string {
  if (event.start.allDay) {
    return "all day";
  }

  return `${localParts(new Date(event.start.value), timezone).time}-${localParts(new Date(event.end.value), timezone).time}`;
}

function eventLine(event: CalendarEvent, timezone: string): string {
  return `- ${timeRange(event, timezone)}: ${event.title}${event.location ? ` (${event.location})` : ""}`;
}

export function formatDailySummary(events: CalendarEvent[], timezone: string): string {
  if (events.length === 0) {
    return "You have no events today.";
  }

  return ["Your events for today:", ...events.map((event) => eventLine(event, timezone))].join("\n");
}

// Events grouped by local start date, in the order given.
export function formatWeeklySummary(events: CalendarEvent[], timezone: string): string {
  if (events.length === 0) {
    return "You have no events for the coming week.";
  }

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const date = event.start.allDay ? event.start.value : localParts(new Date(event.start.value), timezone).date;
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }

  const days = [...byDate].map(([date, dayEvents]) => `${date}:\n${dayEvents.map((event) => eventLine(event, timezone)).join("\n")}`);

  return ["Your events for the coming week:", ...days].join("\n\n");
}

export function formatEventReminder(event: CalendarEvent, minutesLeft: number, timezone: string): string {
  const start = localParts(new Date(event.start.value), timezone).time;

  return `Reminder: "${event.title}" starts at ${start} (in ${minutesLeft} min).${event.location ? ` Place: ${event.location}.` : ""}`;
}


export function formatLateEventReminder(event: CalendarEvent, minutesLeft: number, timezone: string): string {
  const start = localParts(new Date(event.start.value), timezone).time;

  return `I apologize for the delay, there was an issue on my side. But you have "${event.title}" starting at ${start} (in ${minutesLeft} min).${event.location ? ` Place: ${event.location}.` : ""}`;
}
