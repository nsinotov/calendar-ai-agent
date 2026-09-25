import { join } from "node:path";
import { Agent } from "./agent/index.js";
import { AccessControl } from "./app/access-control.js";
import { createAgentContextBuilder } from "./app/agent-context.js";
import { createMessageHandler } from "./app/message-handler.js";
import { createCalendarResolver } from "./app/user-calendar.js";
import { env } from "./config/env.js";
import { createStorage } from "./db/index.js";
import { createLlmProvider } from "./llm/index.js";
import { createLogger } from "./logging/index.js";
import { createMessagingProvider } from "./messaging/index.js";

const logger = createLogger({
  providers: env.LOG_PROVIDERS,
  levels: env.LOG_LEVELS,
  debugEnabled: env.DEBUG_ENABLED,
  dir: env.LOG_DIR ?? join(env.DATA_DIR, "logs"),
  retentionDays: env.LOG_RETENTION_DAYS,
});

const storage = createStorage({
  provider: env.STORAGE_PROVIDER,
  dataDir: env.DATA_DIR,
  encryptionKeyHex: env.SECRETS_ENCRYPTION_KEY,
});

const llm = createLlmProvider(
  {
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    maxTokens: env.LLM_MAX_TOKENS,
    effort: env.LLM_EFFORT,
  },
  logger,
);

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

messaging.onMessage(
  createMessageHandler({
    messaging,
    access: new AccessControl(storage.users),
    conversations: storage.conversations,
    agent: new Agent(llm, storage.conversations, env.LLM_MAX_TOOL_ITERATIONS),
    llm,
    languageOf: (userId) => storage.settings.get(userId).language,
    buildContext: createAgentContextBuilder({
      storage,
      llm,
      resolveCalendar,
      allowedTopics: env.ALLOWED_TOPICS,
      suggestionsEnabled: env.SUGGESTIONS_ENABLED,
    }),
  }),
);

async function shutdown(): Promise<void> {
  await messaging.stop();
  storage.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await messaging.start();
logger.info("app.started");

