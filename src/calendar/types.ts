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
  // Set only for a non-default type (e.g. "birthday"). Meaning is provider-specific;
  // see the provider's `canDelete()` for which types (if any) it rejects deleting.
  eventType?: string;
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
  // Whether this provider supports deleting this event at all (e.g. Google rejects deleting a
  // Contacts-synced birthday event). A cheap, synchronous hint for bulk operations to skip
  // events without an API round trip; deleteEvent is still the source of truth on a single call.
  canDelete(event: CalendarEvent): boolean;
}

