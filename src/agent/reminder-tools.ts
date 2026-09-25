import { z } from "zod";
import type { EventReminderStore } from "../memory/event-reminder-store.js";
import { defineTool, type Tool } from "./tool.js";

// Upcoming events are only looked at two days ahead, so longer lead times would never fire.
export const MAX_REMINDER_MINUTES = 48 * 60;

export function createReminderTools(reminders: EventReminderStore, userId: number): Tool[] {
  return [
    defineTool(
      {
        name: "set_event_reminder",
        description:
          "Set a custom reminder for one calendar event: the user is messaged this many minutes before it starts. It replaces the default reminder time for that event only, and works even when default reminders are off. Find the event id with list_events first. Only for timed events.",
        inputSchema: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "Calendar event id from list_events." },
            minutesBefore: {
              type: "number",
              description: `Minutes before the start, 1 to ${MAX_REMINDER_MINUTES}. Convert hours to minutes.`,
            },
          },
          required: ["eventId", "minutesBefore"],
        },
      },
      z.object({ eventId: z.string().min(1), minutesBefore: z.number().int().min(1).max(MAX_REMINDER_MINUTES) }),
      ({ eventId, minutesBefore }) => {
        reminders.set(userId, eventId, minutesBefore);

        return { eventId, minutesBefore };
      },
    ),
    defineTool(
      {
        name: "remove_event_reminder",
        description: "Remove the custom reminder of one calendar event, so the default reminder time applies again.",
        inputSchema: {
          type: "object",
          properties: { eventId: { type: "string", description: "Calendar event id from list_events." } },
          required: ["eventId"],
        },
      },
      z.object({ eventId: z.string().min(1) }),
      ({ eventId }) => ({ removed: reminders.remove(userId, eventId) }),
    ),
  ];
}

