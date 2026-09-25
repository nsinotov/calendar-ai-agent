import type { CalendarEvent } from "./types.js";

export function hasEnded(event: CalendarEvent, now: Date, timezone: string): boolean {
  if (!event.end.allDay) {
    return Date.parse(event.end.value) <= now.getTime();
  }

  // An all-day end date is exclusive, so the event is over once that date is today or earlier.
  const today = now.toLocaleDateString("en-CA", { timeZone: timezone });

  return event.end.value <= today;
}

