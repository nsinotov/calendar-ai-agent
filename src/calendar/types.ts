export interface EventTime {
  // false: `value` is an RFC3339 date-time ("2026-09-22T10:00:00+03:00").
  // true: `value` is a plain date ("2026-09-22"), for all-day events.
  allDay: boolean;
  value: string;
}

export type EventStatus = "confirmed" | "tentative" | "cancelled";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  status: EventStatus;
}

export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
}

export interface ListEventsOptions {
  // Inclusive bounds, RFC3339 date-time.
  timeMin?: string;
  timeMax?: string;
}

export interface CalendarProvider {
  listEvents(options: ListEventsOptions): Promise<CalendarEvent[]>;
  createEvent(input: EventInput): Promise<CalendarEvent>;
  updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
}

