import type { CalendarEvent } from "../../calendar/index.js";
import type { LlmProvider } from "../../llm/types.js";
import { translate } from "../../llm/translate.js";
import type { EventReminderStore } from "../../memory/event-reminder-store.js";
import type { SentStore } from "../../memory/sent-store.js";
import { formatEventReminder } from "../format.js";
import type { Job, SendMessage } from "../types.js";

const MINUTE_MS = 60 * 1000;
const LOOKAHEAD_MS = 48 * 60 * MINUTE_MS;

export interface EventReminderJobDeps {
  sent: SentStore;
  reminders: EventReminderStore;
  send: SendMessage;
  llm: LlmProvider;
  // How often each user's calendar is fetched; reminders themselves are checked on every tick.
  pollMinutes: number;
  tickMs: number;
}

// Events come from a per-user cache refreshed every `pollMinutes`, so an event deleted
// or moved in between can still trigger one reminder.
export function createEventReminderJob(deps: EventReminderJobDeps): Job {
  const cache = new Map<number, { fetchedAt: number; events: CalendarEvent[] }>();
  const pollMs = deps.pollMinutes * MINUTE_MS;
  // A reminder missed by more than this (poll gap, downtime) is skipped instead of sent late.
  const graceMs = pollMs + deps.tickMs;

  return {
    name: "event-reminders",
    async run({ userId, settings, calendar, now }) {
      const nowMs = now.getTime();
      let cached = cache.get(userId);
      if (!cached || nowMs - cached.fetchedAt >= pollMs) {
        const events = await calendar.listEvents({
          timeMin: now.toISOString(),
          timeMax: new Date(nowMs + LOOKAHEAD_MS).toISOString(),
        });
        cached = { fetchedAt: nowMs, events: events.filter((event) => !event.start.allDay && event.status !== "cancelled") };
        cache.set(userId, cached);
      }

      for (const event of cached.events) {
        const startMs = Date.parse(event.start.value);
        const lead = deps.reminders.get(userId, event.id) ?? (settings.eventReminderEnabled ? settings.eventReminderMinutesBefore : null);
        if (lead === null || startMs <= nowMs) {
          continue;
        }

        const remindAt = startMs - lead * MINUTE_MS;
        const key = `event:${event.id}:${event.start.value}`;
        if (nowMs < remindAt || nowMs > remindAt + graceMs || deps.sent.has(userId, key)) {
          continue;
        }

        const draft = formatEventReminder(event, Math.round((startMs - nowMs) / MINUTE_MS), settings.timezone);
        await deps.send(userId, await translate(deps.llm, settings.language, draft));
        deps.sent.mark(userId, key);
      }
    },
  };
}

