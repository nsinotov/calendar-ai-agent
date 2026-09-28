import { join } from "node:path";
import { Agent, generateSuggestions } from "./agent/index.js";
import { BillingLlmProvider } from "./billing/billing-llm-provider.js";
import { BillingService } from "./billing/billing-service.js";
import { createMessagingNotifier } from "./billing/notifier.js";
import { AccessControl } from "./app/access-control.js";
import { createAgentContextBuilder } from "./app/agent-context.js";
import { createMessageHandler } from "./app/message-handler.js";
import { createCommands } from "./app/commands.js";
import { createCalendarResolver } from "./app/user-calendar.js";
import { env } from "./config/env.js";
import { createStorage } from "./db/index.js";
import { createLlmProvider } from "./llm/index.js";
import { AlertLogProvider, createLogger } from "./logging/index.js";
import { createMessagingProvider } from "./messaging/index.js";
import { createActivityJob } from "./scheduler/jobs/activity-job.js";
import { createCleanupJob } from "./scheduler/jobs/cleanup-job.js";
import { createEventReminderJob } from "./scheduler/jobs/event-reminder-job.js";
import { createSummaryJob } from "./scheduler/jobs/summary-job.js";
import { Scheduler } from "./scheduler/scheduler.js";
import type { JobContext } from "./scheduler/types.js";

const OUTAGE_PROBE_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULER_TICK_MS = 60 * 1000;

const adminAlerts = new AlertLogProvider();
const logger = createLogger({
  providers: env.LOG_PROVIDERS,
  levels: env.LOG_LEVELS,
  debugEnabled: env.DEBUG_ENABLED,
  dir: env.LOG_DIR ?? join(env.DATA_DIR, "logs"),
  retentionDays: env.LOG_RETENTION_DAYS,
  extraProviders: env.ADMIN_ERROR_ALERTS ? [adminAlerts] : [],
});

const storage = createStorage({
  provider: env.STORAGE_PROVIDER,
  dataDir: env.DATA_DIR,
  encryptionKeyHex: env.SECRETS_ENCRYPTION_KEY,
  contextRetentionDays: env.CONTEXT_RETENTION_DAYS,
});

const messaging = createMessagingProvider(
  {
    provider: env.MESSAGING_PROVIDER,
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhook:
      env.TELEGRAM_WEBHOOK_URL && env.TELEGRAM_WEBHOOK_SECRET
        ? { url: env.TELEGRAM_WEBHOOK_URL, secret: env.TELEGRAM_WEBHOOK_SECRET, port: env.PORT }
        : undefined,
  },
  logger,
);

if (env.LLM_BUDGET_USD !== undefined && storage.billing.get().balanceUsd === null) {
  storage.billing.setBalance(env.LLM_BUDGET_USD);
}

const notifier = createMessagingNotifier(messaging, storage.users, logger);
adminAlerts.connect((text) => notifier.notifyAdmins(text));

const billing = new BillingService(
  storage.billing,
  notifier,
  {
    prices:
      env.LLM_BUDGET_USD !== undefined && env.LLM_INPUT_PRICE_PER_MTOK !== undefined && env.LLM_OUTPUT_PRICE_PER_MTOK !== undefined
        ? { inputPerMtok: env.LLM_INPUT_PRICE_PER_MTOK, outputPerMtok: env.LLM_OUTPUT_PRICE_PER_MTOK }
        : null,
    lowBalanceUsd: env.LLM_LOW_BALANCE_USD,
    probeIntervalMs: OUTAGE_PROBE_INTERVAL_MS,
  },
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
  logger,
  ),
  billing,
);

const resolveCalendar = createCalendarResolver({
  settings: storage.settings,
  secrets: storage.secrets,
  appCredentials: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  },
  logger,
});

const commands = createCommands({
  conversations: storage.conversations,
  billing,
  llm,
  languageOf: (userId) => storage.settings.get(userId).language,
});

messaging.onMessage(
  createMessageHandler({
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
      resolveCalendar,
      allowedTopics: env.ALLOWED_TOPICS,
      suggestionsEnabled: env.SUGGESTIONS_ENABLED,
      toolResultRetentionMinutes: env.TOOL_RESULT_RETENTION_MINUTES,
    }),
  }),
);

const send = (userId: number, text: string) => messaging.send(userId, text);
const activityDeps = { llm, notes: storage.notes, store: storage.activity };
const suggestions = env.SUGGESTIONS_ENABLED
  ? ({ userId, settings, calendar, now }: JobContext) =>
      generateSuggestions({ ...activityDeps, calendar }, userId, settings.language, now)
  : undefined;

const scheduler = new Scheduler(
  {
    users: storage.users,
    settings: storage.settings,
    resolveCalendar,
    logger,
    jobs: [
      createSummaryJob({ kind: "weekly", sent: storage.sent, send, llm, suggestions }),
      createSummaryJob({ kind: "daily", sent: storage.sent, send, llm, suggestions }),
      createEventReminderJob({
        sent: storage.sent,
        reminders: storage.eventReminders,
        send,
        llm,
        pollMinutes: env.CALENDAR_POLL_MINUTES,
        tickMs: SCHEDULER_TICK_MS,
      }),
      createCleanupJob({ sent: storage.sent, reminders: storage.eventReminders }),
      ...(env.SUGGESTIONS_ENABLED ? [createActivityJob({ sent: storage.sent, activity: activityDeps })] : []),
    ],
  },
  SCHEDULER_TICK_MS,
);

async function shutdown(): Promise<void> {
  scheduler.stop();
  await messaging.stop();
  storage.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await messaging.start();
scheduler.start();
logger.info("app.started");

