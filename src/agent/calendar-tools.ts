import { z } from "zod";
import type { CalendarEvent, CalendarProvider, EventTime } from "../calendar/index.js";
import { defineTool, type Tool } from "./tool.js";

const dateTime = z.string().datetime({ offset: true });
const timeValue = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTime]);

const TIME_HINT =
  'A plain date ("2026-09-22") makes an all-day event; otherwise an RFC3339 date-time with UTC offset ("2026-09-22T10:00:00+03:00"). For all-day events the end date is exclusive (a one-day event ends on the next day).';

const TIME_PROPERTY = { type: "string", description: TIME_HINT };

export function createCalendarTools(calendar: CalendarProvider, options: { timezone: string; now?: () => Date }): Tool[] {
  const now = options.now ?? (() => new Date());

  return [
    defineTool(
      {
        name: "list_events",
        description: "List calendar events in a time range, ordered by start time. Without bounds, returns all events.",
        inputSchema: {
          type: "object",
          properties: {
            timeMin: { type: "string", description: "Range start, RFC3339 date-time with UTC offset." },
            timeMax: { type: "string", description: "Range end, RFC3339 date-time with UTC offset." },
          },
        },
      },
      z.object({ timeMin: dateTime.optional(), timeMax: dateTime.optional() }),
      (args) => calendar.listEvents(args),
    ),
    defineTool(
      {
        name: "create_event",
        description: "Create a calendar event.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            start: TIME_PROPERTY,
            end: TIME_PROPERTY,
            description: { type: "string" },
            location: { type: "string" },
          },
          required: ["title", "start", "end"],
        },
      },
      z.object({
        title: z.string().min(1),
        start: timeValue,
        end: timeValue,
        description: z.string().optional(),
        location: z.string().optional(),
      }),
      (args) =>
        calendar.createEvent({
          ...args,
          start: toEventTime(args.start),
          end: toEventTime(args.end),
        }),
    ),
    defineTool(
      {
        name: "update_event",
        description: "Change an existing event. Only the provided fields are changed.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Event id from list_events." },
            title: { type: "string" },
            start: TIME_PROPERTY,
            end: TIME_PROPERTY,
            description: { type: "string" },
            location: { type: "string" },
          },
          required: ["id"],
        },
      },
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        start: timeValue.optional(),
        end: timeValue.optional(),
        description: z.string().optional(),
        location: z.string().optional(),
      }),
      ({ id, start, end, ...rest }) =>
        calendar.updateEvent(id, {
          ...rest,
          ...(start && { start: toEventTime(start) }),
          ...(end && { end: toEventTime(end) }),
        }),
    ),
    defineTool(
      {
        name: "delete_event",
        description: "Delete one event by id.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Event id from list_events." } },
          required: ["id"],
        },
      },
      z.object({ id: z.string().min(1) }),
      async ({ id }) => {
        await calendar.deleteEvent(id);

        return { deleted: 1 };
      },
    ),
    defineTool(
      {
        name: "delete_old_events",
        description: "Delete every event that has already ended, in one call. Irreversible: confirm with the user first.",
        inputSchema: { type: "object", properties: {} },
      },
      z.object({}),
      async () => {
        const events = await calendar.listEvents({ timeMax: now().toISOString() });
        const old = events.filter((event) => hasEnded(event, now(), options.timezone));
        for (const event of old) {
          await calendar.deleteEvent(event.id);
        }

        return { deleted: old.length };
      },
    ),
  ];
}

function toEventTime(value: string): EventTime {
  return { allDay: !value.includes("T"), value };
}

function hasEnded(event: CalendarEvent, now: Date, timezone: string): boolean {
  if (!event.end.allDay) {
    return Date.parse(event.end.value) <= now.getTime();
  }

  // An all-day end date is exclusive, so the event is over once that date is today or earlier.
  const today = now.toLocaleDateString("en-CA", { timeZone: timezone });

  return event.end.value <= today;
}

