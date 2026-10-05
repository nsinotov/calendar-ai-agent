import assert from "node:assert/strict";
import { test } from "node:test";
import { GaxiosError } from "gaxios";
import type { calendar_v3 } from "googleapis";
import { CalendarError } from "./errors.js";
import { GoogleCalendarProvider } from "./google-provider.js";
import type { CalendarEvent, EventInput } from "./types.js";

function fakeClient(overrides: Partial<calendar_v3.Calendar["events"]>): calendar_v3.Calendar {
  return { events: overrides } as unknown as calendar_v3.Calendar;
}

function fakeGaxiosError(status: number, message = "error"): GaxiosError {
  return new GaxiosError(message, {} as never, {
    status,
    statusText: message,
    data: {},
    headers: {},
    config: {} as never,
  } as never);
}

test("listEvents() converts timed and all-day events", async () => {
  let sentParams: unknown;
  const client = fakeClient({
    list: (async (params: unknown) => {
      sentParams = params;

      return {
        data: {
          items: [
            {
              id: "e1",
              summary: "Standup",
              start: { dateTime: "2026-09-22T10:00:00+03:00" },
              end: { dateTime: "2026-09-22T10:30:00+03:00" },
              status: "confirmed",
            },
            {
              id: "e2",
              summary: "Vacation",
              start: { date: "2026-09-23" },
              end: { date: "2026-09-24" },
              status: "tentative",
            },
          ],
        },
      };
    }) as calendar_v3.Calendar["events"]["list"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  const events = await provider.listEvents({ timeMin: "2026-09-22T00:00:00Z", timeMax: "2026-09-29T00:00:00Z" });

  assert.deepEqual(events, [
    {
      id: "e1",
      title: "Standup",
      description: undefined,
      location: undefined,
      start: { allDay: false, value: "2026-09-22T10:00:00+03:00" },
      end: { allDay: false, value: "2026-09-22T10:30:00+03:00" },
      status: "confirmed",
      eventType: undefined,
    },
    {
      id: "e2",
      title: "Vacation",
      description: undefined,
      location: undefined,
      start: { allDay: true, value: "2026-09-23" },
      end: { allDay: true, value: "2026-09-24" },
      status: "tentative",
      eventType: undefined,
    },
  ]);
  assert.deepEqual(sentParams, {
    calendarId: "primary",
    timeMin: "2026-09-22T00:00:00Z",
    timeMax: "2026-09-29T00:00:00Z",
    singleEvents: true,
    orderBy: "startTime",
  });
});

test("listEvents() surfaces a non-default eventType but normalizes \"default\" to undefined", async () => {
  const client = fakeClient({
    list: (async () => ({
      data: {
        items: [
          {
            id: "e1",
            summary: "Someone's birthday",
            start: { date: "2026-09-22" },
            end: { date: "2026-09-23" },
            status: "confirmed",
            eventType: "birthday",
          },
          {
            id: "e2",
            summary: "Standup",
            start: { dateTime: "2026-09-22T10:00:00+03:00" },
            end: { dateTime: "2026-09-22T10:30:00+03:00" },
            status: "confirmed",
            eventType: "default",
          },
        ],
      },
    })) as calendar_v3.Calendar["events"]["list"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  const events = await provider.listEvents({});

  assert.equal(events[0]?.eventType, "birthday");
  assert.equal(events[1]?.eventType, undefined);
});

test("createEvent() sends only the given fields and converts the result", async () => {
  let sentParams: unknown;
  const client = fakeClient({
    insert: (async (params: unknown) => {
      sentParams = params;

      return {
        data: {
          id: "e1",
          summary: "Doctor",
          start: { dateTime: "2026-10-01T09:00:00+03:00" },
          end: { dateTime: "2026-10-01T09:30:00+03:00" },
          status: "confirmed",
        },
      };
    }) as calendar_v3.Calendar["events"]["insert"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");
  const input: EventInput = {
    title: "Doctor",
    start: { allDay: false, value: "2026-10-01T09:00:00+03:00" },
    end: { allDay: false, value: "2026-10-01T09:30:00+03:00" },
  };

  const event = await provider.createEvent(input);

  assert.equal(event.id, "e1");
  assert.deepEqual(sentParams, {
    calendarId: "primary",
    requestBody: {
      summary: "Doctor",
      start: { dateTime: "2026-10-01T09:00:00+03:00" },
      end: { dateTime: "2026-10-01T09:30:00+03:00" },
    },
  });
});

test("updateEvent() only sends the fields that were set (PATCH semantics)", async () => {
  let sentParams: unknown;
  const client = fakeClient({
    patch: (async (params: unknown) => {
      sentParams = params;

      return {
        data: { id: "e1", summary: "Doctor (moved)", start: { dateTime: "2026-10-01T11:00:00+03:00" }, end: { dateTime: "2026-10-01T11:30:00+03:00" }, status: "confirmed" },
      };
    }) as calendar_v3.Calendar["events"]["patch"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  await provider.updateEvent("e1", { title: "Doctor (moved)" });

  assert.deepEqual(sentParams, {
    calendarId: "primary",
    eventId: "e1",
    requestBody: { summary: "Doctor (moved)" },
  });
});

test("deleteEvent() calls delete with the calendar and event id", async () => {
  let sentParams: unknown;
  const client = fakeClient({
    delete: (async (params: unknown) => {
      sentParams = params;
    }) as unknown as calendar_v3.Calendar["events"]["delete"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  await provider.deleteEvent("e1");

  assert.deepEqual(sentParams, { calendarId: "primary", eventId: "e1" });
});

test("canDelete() is false only for a known non-deletable eventType", () => {
  const provider = new GoogleCalendarProvider({} as calendar_v3.Calendar, "primary");
  const event = (eventType?: string): CalendarEvent => ({
    id: "e1",
    title: "x",
    start: { allDay: true, value: "2026-09-22" },
    end: { allDay: true, value: "2026-09-23" },
    status: "confirmed",
    eventType,
  });

  assert.equal(provider.canDelete(event()), true);
  assert.equal(provider.canDelete(event("outOfOffice")), true);
  assert.equal(provider.canDelete(event("birthday")), false);
});

test("deleteEvent() gives a clear, actionable message for a non-deletable event type", async () => {
  const client = fakeClient({
    delete: (async () => {
      throw fakeGaxiosError(400, "Attempt made to modify 'birthday' event in a way that is not valid for this event type.");
    }) as unknown as calendar_v3.Calendar["events"]["delete"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  await assert.rejects(provider.deleteEvent("e1"), (error: unknown) => {
    assert.ok(error instanceof CalendarError);
    assert.match(error.message, /Google Contacts/);

    return true;
  });
});

test("a revoked refresh token becomes an auth error with a clear message", async () => {
  const client = fakeClient({
    list: (async () => {
      throw new Error("invalid_grant");
    }) as calendar_v3.Calendar["events"]["list"],
  });
  const provider = new GoogleCalendarProvider(client, "primary");

  await assert.rejects(provider.listEvents({}), (error: unknown) => {
    assert.ok(error instanceof CalendarError);
    assert.equal(error.kind, "auth");
    assert.match(error.message, /authorize Google Calendar again/);

    return true;
  });
});

test("maps Gaxios error statuses to CalendarError kinds", async () => {
  const cases: [number, string][] = [
    [401, "auth"],
    [403, "auth"],
    [404, "not_found"],
    [429, "rate_limit"],
    [500, "unavailable"],
    [418, "unknown"],
  ];

  for (const [status, expectedKind] of cases) {
    const client = fakeClient({
      list: (async () => {
        throw fakeGaxiosError(status);
      }) as calendar_v3.Calendar["events"]["list"],
    });
    const provider = new GoogleCalendarProvider(client, "primary");

    await assert.rejects(
      provider.listEvents({}),
      (error: unknown) => {
        assert.ok(error instanceof CalendarError, `status ${status}: expected a CalendarError`);
        assert.equal(error.kind, expectedKind, `status ${status}`);

        return true;
      },
    );
  }
});

