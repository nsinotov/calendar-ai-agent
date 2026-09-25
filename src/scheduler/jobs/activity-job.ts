import { refreshActivitySummary, type ActivityDeps } from "../../agent/index.js";
import type { SentStore } from "../../memory/sent-store.js";
import { inWindow, localParts } from "../local-time.js";
import type { Job } from "../types.js";

const RUN_AT = "03:30";
const GRACE_MINUTES = 20 * 60;

// WARNING: experimental. Once a day per user: rewrites the activity memory from events and notes
// (sensitive data goes to the LLM). Only add this job when SUGGESTIONS_ENABLED is on.
export function createActivityJob(deps: { sent: SentStore; activity: Omit<ActivityDeps, "calendar"> }): Job {
  return {
    name: "activity-memory",
    async run({ userId, settings, calendar, now }) {
      const local = localParts(now, settings.timezone);
      const key = `activity:${local.date}`;
      if (!inWindow(local, RUN_AT, GRACE_MINUTES) || deps.sent.has(userId, key)) {
        return;
      }

      await refreshActivitySummary({ ...deps.activity, calendar }, userId, now);
      deps.sent.mark(userId, key);
    },
  };
}

