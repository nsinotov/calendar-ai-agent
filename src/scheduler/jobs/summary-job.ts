import type { LlmProvider } from "../../llm/types.js";
import { translate } from "../../llm/translate.js";
import type { SentStore } from "../../memory/sent-store.js";
import { formatDailySummary, formatWeeklySummary } from "../format.js";
import { addDays, inWindow, localParts, startOfLocalDay } from "../local-time.js";
import type { Job, JobContext, SendMessage } from "../types.js";

// A summary due while the app was down is still sent this long after its time.
const GRACE_MINUTES = 120;

export interface SummaryJobDeps {
  kind: "daily" | "weekly";
  sent: SentStore;
  send: SendMessage;
  llm: LlmProvider;
  // Experimental follow-ups appended to the summary; omit to send the summary alone.
  suggestions?: (context: JobContext) => Promise<string[]>;
}

export function createSummaryJob(deps: SummaryJobDeps): Job {
  const weekly = deps.kind === "weekly";

  return {
    name: `${deps.kind}-summary`,
    async run(context) {
      const { userId, settings, calendar, now } = context;
      const enabled = weekly ? settings.weeklyReminderEnabled : settings.dailyReminderEnabled;
      const time = weekly ? settings.weeklyReminderTime : settings.dailyReminderTime;
      const local = localParts(now, settings.timezone);
      const key = `${deps.kind}:${local.date}`;

      if (!enabled || (weekly && local.weekday !== settings.weekStart) || !inWindow(local, time, GRACE_MINUTES) || deps.sent.has(userId, key)) {
        return;
      }

      const start = startOfLocalDay(local.date, settings.timezone);
      const end = startOfLocalDay(addDays(local.date, weekly ? 7 : 1), settings.timezone);
      const events = (await calendar.listEvents({ timeMin: start.toISOString(), timeMax: end.toISOString() })).filter(
        (event) => event.status !== "cancelled",
      );
      const draft = weekly ? formatWeeklySummary(events, settings.timezone) : formatDailySummary(events, settings.timezone);
      const parts = [await translate(deps.llm, settings.language, draft)];
      if (deps.suggestions) {
        parts.push(...(await deps.suggestions(context).catch(() => [])));
      }

      await deps.send(userId, parts.join("\n\n"));
      deps.sent.mark(userId, key);
    },
  };
}

