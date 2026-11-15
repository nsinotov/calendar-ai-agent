// Generates the chat for the README demo: the real agent and LLM from .env, an in-memory calendar
// with sample events and a fixed clock. Writes transcript.json for record.ts to play back.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "../../agent/index.js";
import { AccessControl } from "../../app/access-control.js";
import { createAgentContextBuilder } from "../../app/agent-context.js";
import { createCommands } from "../../app/commands.js";
import { createMessageHandler } from "../../app/message-handler.js";
import { BillingLlmProvider } from "../../billing/billing-llm-provider.js";
import { BillingService } from "../../billing/billing-service.js";
import type { CalendarEvent, CalendarProvider, EventInput, ListEventsOptions } from "../../calendar/types.js";
import { env } from "../../config/env.js";
import { createStorage } from "../../db/index.js";
import { createLlmProvider } from "../../llm/index.js";
import type { Logger } from "../../logging/index.js";
import { ONBOARDING_STEPS } from "../../memory/user-settings-store.js";
import type { MessagingProvider } from "../../messaging/index.js";
import { createSummaryJob } from "../../scheduler/jobs/summary-job.js";
import { addDays, minutesOfDay, startOfLocalDay } from "../../scheduler/local-time.js";

const USER = 1;
const TIMEZONE = "Europe/London";
// A Monday, so the weekly summary is due.
const DEMO_DATE = "2026-11-02";
const MINUTE = 60_000;

const USER_MESSAGES = [
  "Add book club this Thursday from 7 to 9 pm",
  "What do I have tomorrow and next week?",
  "Cancel the dentist next week",
  "Show my settings",
  "Remind me 30 minutes before events instead",
];

// [day offset from DEMO_DATE, start "HH:MM", duration in minutes, title]
const SAMPLE_EVENTS: [number, string, number, string][] = [
  [0, "18:30", 60, "Gym"],
  [1, "09:30", 30, "Team stand-up"],
  [1, "13:00", 60, "Lunch with Mark"],
  [2, "17:00", 45, "Emma's piano lesson"],
  [4, "20:00", 120, "Movie night"],
  [5, "11:00", 90, "Kids' football match"],
  [7, "10:00", 60, "Quarterly review"],
  [9, "15:00", 60, "Dentist"],
  [11, "19:00", 150, "Anna's birthday dinner"],
];

class MemoryCalendar implements CalendarProvider {
  private readonly events: CalendarEvent[] = [];
  private nextId = 1;

  listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    const min = options.timeMin ? Date.parse(options.timeMin) : -Infinity;
    const max = options.timeMax ? Date.parse(options.timeMax) : Infinity;

    return Promise.resolve(
      this.events
        .filter((event) => Date.parse(event.end.value) >= min && Date.parse(event.start.value) <= max)
        .sort((a, b) => Date.parse(a.start.value) - Date.parse(b.start.value)),
    );
  }

  createEvent(input: EventInput): Promise<CalendarEvent> {
    const event: CalendarEvent = { id: `e${this.nextId++}`, status: "confirmed", ...input };
    this.events.push(event);

    return Promise.resolve(event);
  }

  updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      return Promise.reject(new Error(`No event ${id}`));
    }
    Object.assign(event, input);

    return Promise.resolve(event);
  }

  deleteEvent(id: string): Promise<void> {
    const index = this.events.findIndex((e) => e.id === id);
    if (index === -1) {
      return Promise.reject(new Error(`No event ${id}`));
    }
    this.events.splice(index, 1);

    return Promise.resolve();
  }

  canDelete(): boolean {
    return true;
  }
}

function localTime(date: string, time: string): Date {
  return new Date(startOfLocalDay(date, TIMEZONE).getTime() + minutesOfDay(time) * MINUTE);
}

const silentLogger: Logger = { error() {}, warn() {}, info() {}, debug() {} };

const dir = mkdtempSync(join(tmpdir(), "calendar-agent-demo-"));
const storage = createStorage({
  provider: "sqlite",
  dataDir: dir,
  encryptionKeyHex: "00".repeat(32),
  contextRetentionDays: env.CONTEXT_RETENTION_DAYS,
});

try {
  storage.users.upsert(USER, "user");
  storage.settings.update(USER, {
    name: "Alex",
    language: "en",
    timezone: TIMEZONE,
    weekStart: "monday",
    calendarProvider: "google",
  });
  storage.settings.markOnboardingSteps(USER, ONBOARDING_STEPS);
  const settings = storage.settings.get(USER);

  const calendar = new MemoryCalendar();
  for (const [offset, start, minutes, title] of SAMPLE_EVENTS) {
    const from = localTime(addDays(DEMO_DATE, offset), start);
    await calendar.createEvent({
      title,
      start: { allDay: false, value: from.toISOString() },
      end: { allDay: false, value: new Date(from.getTime() + minutes * MINUTE).toISOString() },
    });
  }

  // The summary goes out at the user's weekly reminder time; the chat starts a few minutes later.
  let now = localTime(DEMO_DATE, settings.weeklyReminderTime);
  const billing = new BillingService(
    storage.billing,
    { notifyAdmins: async () => {}, broadcast: async () => {} },
    { prices: null, lowBalanceUsd: 0, probeIntervalMs: MINUTE },
  );
  const llm = new BillingLlmProvider(
    createLlmProvider(
      {
        provider: env.LLM_PROVIDER,
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL,
        maxTokens: env.LLM_MAX_TOKENS,
        effort: env.LLM_EFFORT,
      },
      silentLogger,
    ),
    billing,
  );

  const transcript: { from: "bot" | "user"; text: string; at: string }[] = [];
  const messaging: MessagingProvider = {
    onMessage() {},
    send: (_userId, text) => {
      transcript.push({ from: "bot", text, at: now.toISOString() });

      return Promise.resolve();
    },
    start: async () => {},
    stop: async () => {},
  };

  await createSummaryJob({
    kind: "weekly",
    sent: storage.sent,
    send: (userId, text) => messaging.send(userId, text),
    llm,
  }).run({
    userId: USER,
    settings,
    calendar,
    now,
  });

  const commands = createCommands({
    conversations: storage.conversations,
    billing,
    llm,
    languageOf: (userId) => storage.settings.get(userId).language,
  });
  const handler = createMessageHandler({
    messaging,
    access: new AccessControl(storage.users),
    agent: new Agent(llm, storage.conversations, env.LLM_MAX_TOOL_ITERATIONS),
    users: storage.users,
    billing,
    commands,
    buildContext: createAgentContextBuilder({
      storage,
      llm,
      commands,
      resolveCalendar: () => calendar,
      allowedTopics: [],
      suggestionsEnabled: false,
      toolResultRetentionMinutes: env.TOOL_RESULT_RETENTION_MINUTES,
      now: () => now,
    }),
  });

  now = new Date(now.getTime() + 7 * MINUTE);
  for (const text of USER_MESSAGES) {
    transcript.push({ from: "user", text, at: now.toISOString() });
    await handler({ userId: USER, text });
    now = new Date(now.getTime() + MINUTE);
  }

  const out = join(dirname(fileURLToPath(import.meta.url)), "transcript.json");
  writeFileSync(out, `${JSON.stringify({ timezone: TIMEZONE, messages: transcript }, null, 2)}\n`);
  console.log(`Wrote ${transcript.length} messages to ${out}`);
} finally {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
}
