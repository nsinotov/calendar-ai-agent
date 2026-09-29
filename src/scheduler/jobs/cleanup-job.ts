import { hasEnded } from "../../calendar/index.js";
import type { EventReminderStore } from "../../memory/event-reminder-store.js";
import type { SentStore } from "../../memory/sent-store.js";
import { inWindow, localParts } from "../local-time.js";
import type { Job } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_AT = "03:00";
// Any time after RUN_AT the same local day counts, so a restart does not skip the day.
const GRACE_MINUTES = 20 * 60;
const KEEP_BOOKKEEPING_DAYS = 60;

export interface CleanupJobDeps {
  sent: SentStore;
  reminders: EventReminderStore;
}

// Once a day per user: deletes events that ended more than the retention period ago
// (only when the user chose "delete") and prunes the scheduler's own bookkeeping.
export function createCleanupJob(deps: CleanupJobDeps): Job {
  return {
    name: "cleanup",
    async run({ userId, settings, calendar, now }) {
      const local = localParts(now, settings.timezone);
      const key = `cleanup:${local.date}`;
      if (!inWindow(local, RUN_AT, GRACE_MINUTES) || deps.sent.has(userId, key)) {
        return;
      }

      if (settings.oldEventsAction === "delete") {
        const cutoff = new Date(now.getTime() - settings.oldEventsRetentionDays * DAY_MS);
        const events = await calendar.listEvents({ timeMax: cutoff.toISOString() });
        const old = events.filter((candidate) => hasEnded(candidate, cutoff, settings.timezone) && calendar.canDelete(candidate));
        for (const event of old) {
          try {
            await calendar.deleteEvent(event.id);
          } catch {
            // A type we don't know about yet also rejected deletion; don't let it keep this job
            // retrying (and re-alerting admins) for the rest of the day's window.
          }
        }
      }

      const bookkeepingCutoff = now.getTime() - KEEP_BOOKKEEPING_DAYS * DAY_MS;
      deps.sent.pruneOlderThan(bookkeepingCutoff);
      deps.reminders.pruneOlderThan(bookkeepingCutoff);
      deps.sent.mark(userId, key);
    },
  };
}

