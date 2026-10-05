import { GaxiosError } from "gaxios";
import type { calendar_v3 } from "googleapis";
import { CalendarError } from "./errors.js";
import type { CalendarEvent, CalendarProvider, EventInput, EventTime, ListEventsOptions } from "./types.js";

// Auto-generated from Google Contacts; the Calendar API rejects deleting them directly.
const NON_DELETABLE_EVENT_TYPES: readonly string[] = ["birthday"];
const NON_DELETABLE_EVENT_TYPE_MESSAGE = "is not valid for this event type";
const REVOKED_ACCESS_MESSAGE = "invalid_grant";

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private readonly client: calendar_v3.Calendar,
    private readonly calendarId: string,
  ) {}

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    try {
      const response = await this.client.events.list({
        calendarId: this.calendarId,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });

      return (response.data.items ?? []).map(fromGoogleEvent);
    } catch (error) {
      throw toCalendarError(error);
    }
  }

  async createEvent(input: EventInput): Promise<CalendarEvent> {
    try {
      const response = await this.client.events.insert({
        calendarId: this.calendarId,
        requestBody: toGoogleEvent(input),
      });

      return fromGoogleEvent(response.data);
    } catch (error) {
      throw toCalendarError(error);
    }
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent> {
    try {
      const response = await this.client.events.patch({
        calendarId: this.calendarId,
        eventId: id,
        requestBody: toGoogleEvent(input),
      });

      return fromGoogleEvent(response.data);
    } catch (error) {
      throw toCalendarError(error);
    }
  }

  async deleteEvent(id: string): Promise<void> {
    try {
      await this.client.events.delete({ calendarId: this.calendarId, eventId: id });
    } catch (error) {
      throw toCalendarError(error);
    }
  }

  canDelete(event: CalendarEvent): boolean {
    return !event.eventType || !NON_DELETABLE_EVENT_TYPES.includes(event.eventType);
  }
}

function fromGoogleEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  return {
    id: event.id ?? "",
    title: event.summary ?? "(untitled)",
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: fromGoogleEventTime(event.start),
    end: fromGoogleEventTime(event.end),
    status: toEventStatus(event.status),
    eventType: event.eventType && event.eventType !== "default" ? event.eventType : undefined,
  };
}

function fromGoogleEventTime(time: calendar_v3.Schema$EventDateTime | undefined): EventTime {
  if (time?.date) {
    return { allDay: true, value: time.date };
  }
  if (time?.dateTime) {
    return { allDay: false, value: time.dateTime };
  }

  throw new CalendarError("unknown", "Event is missing both date and dateTime");
}

function toEventStatus(status: string | null | undefined): CalendarEvent["status"] {
  return status === "tentative" || status === "cancelled" ? status : "confirmed";
}

// Partial<EventInput> on update: only fields the caller set are sent,
// so untouched fields on the existing event are left alone (PATCH semantics).
function toGoogleEvent(input: Partial<EventInput>): calendar_v3.Schema$Event {
  return {
    ...(input.title !== undefined && { summary: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.location !== undefined && { location: input.location }),
    ...(input.start !== undefined && { start: toGoogleEventTime(input.start) }),
    ...(input.end !== undefined && { end: toGoogleEventTime(input.end) }),
  };
}

function toGoogleEventTime(time: EventTime): calendar_v3.Schema$EventDateTime {
  return time.allDay ? { date: time.value } : { dateTime: time.value };
}

function toCalendarError(error: unknown): CalendarError {
  if (error instanceof Error && error.message.includes(REVOKED_ACCESS_MESSAGE)) {
    return new CalendarError(
      "auth",
      "Google access for this user was revoked or expired (e.g. after a password change). The user must authorize Google Calendar again.",
      { cause: error },
    );
  }
  if (error instanceof GaxiosError) {
    switch (error.status) {
      case 401:
      case 403:
        return new CalendarError("auth", error.message, { cause: error });
      case 404:
        return new CalendarError("not_found", error.message, { cause: error });
      case 429:
        return new CalendarError("rate_limit", error.message, { cause: error });
      default:
        if (error.status !== undefined && error.status >= 500) {
          return new CalendarError("unavailable", error.message, { cause: error });
        }
    }
    if (error.message.includes(NON_DELETABLE_EVENT_TYPE_MESSAGE)) {
      return new CalendarError(
        "unknown",
        "This event can't be deleted through the Calendar API (e.g. a birthday synced from Google Contacts). Remove or edit it in Google Contacts, or hide birthdays in Calendar settings, instead.",
        { cause: error },
      );
    }
  }
  if (error instanceof CalendarError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new CalendarError("unknown", message, { cause: error });
}

