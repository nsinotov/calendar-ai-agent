import { z } from "zod";

const boolFromEnv = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(fallback ? "true" : "false")
    .transform((value) => value === "true");

// Comma-separated list, e.g. "error,warn,info" -> ["error", "warn", "info"].
const csvEnum = <T extends [string, ...string[]]>(values: T, fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));

// Comma-separated list of free-form identifiers; the matching factory rejects unknown ones.
const csvList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1));

const envSchema = z.object({
  // --- LLM: shared across all users, paid by the admin ---
  // Provider identifier; unknown values are rejected at startup by the LLM factory.
  LLM_PROVIDER: z.string().min(1).default("anthropic"),
  // API key of the chosen provider
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1).default("claude-sonnet-5"),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(8000),
  // How much the model "thinks" per answer; unset = provider default
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  // Safety limit for tool-call rounds within one user message
  LLM_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(8),
  // Prepaid credit balance in USD; enables local spend tracking and low-balance warnings
  LLM_BUDGET_USD: z.coerce.number().positive().optional(),
  LLM_LOW_BALANCE_USD: z.coerce.number().positive().default(2),
  // Model prices in USD per 1M tokens, needed to estimate spend when a budget is set
  LLM_INPUT_PRICE_PER_MTOK: z.coerce.number().nonnegative().optional(),
  LLM_OUTPUT_PRICE_PER_MTOK: z.coerce.number().nonnegative().optional(),

  // Extra topics the assistant may help with beyond calendar and notes, e.g. "weather,cooking"
  ALLOWED_TOPICS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),

  // Experimental: activity memory and the suggestions tool. Off by default.
  SUGGESTIONS_ENABLED: boolFromEnv(false),

  MESSAGING_PROVIDER: z.string().min(1).default("telegram"),
  // Telegram provider settings
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  // Set for production (webhook); leave empty in dev (long polling)
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  // The app's own OAuth identity, shared across users; each user authorizes it
  // separately and gets their own refresh token (stored per-user, encrypted).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // How often the scheduler checks every user's calendar for upcoming events
  CALENDAR_POLL_MINUTES: z.coerce.number().int().positive().default(15),

  STORAGE_PROVIDER: z.string().min(1).default("sqlite"),
  DATA_DIR: z.string().min(1).default("./data"),

  // AES-256-GCM key for per-user secrets (Google refresh tokens, ...): 32 bytes, hex-encoded.
  // Generate with: openssl rand -hex 32
  SECRETS_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "Expected 64 hex characters (32 bytes)"),

  DEBUG_ENABLED: boolFromEnv(false),
  LOG_LEVELS: csvEnum(["error", "warn", "info"], "error,warn,info"),
  LOG_PROVIDERS: csvList("console"),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  // Where the file provider writes logs. Defaults to DATA_DIR/logs.
  LOG_DIR: z.string().min(1).optional(),
});

export const env = envSchema
  .superRefine((value, ctx) => {
    if (value.TELEGRAM_WEBHOOK_URL && !value.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["TELEGRAM_WEBHOOK_SECRET"],
        message: "Required when TELEGRAM_WEBHOOK_URL is set",
      });
    }
    if (
      value.LLM_BUDGET_USD !== undefined &&
      (value.LLM_INPUT_PRICE_PER_MTOK === undefined ||
        value.LLM_OUTPUT_PRICE_PER_MTOK === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_BUDGET_USD"],
        message: "Set LLM_INPUT_PRICE_PER_MTOK and LLM_OUTPUT_PRICE_PER_MTOK to track a budget",
      });
    }
  })
  .parse(withoutEmptyValues(process.env));

// `KEY=` in a .env file means "not set", not an empty string.
function withoutEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
}

