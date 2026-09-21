import { z } from "zod";

const boolFromEnv = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(fallback ? "true" : "false")
    .transform((value) => value === "true");

const timeOfDay = (fallback: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM").default(fallback);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
  // Prepaid credit balance in USD; enables local spend tracking and low-balance warnings
  ANTHROPIC_BUDGET_USD: z.coerce.number().positive().optional(),
  ANTHROPIC_LOW_BALANCE_USD: z.coerce.number().positive().default(2),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_USER_ID: z.coerce.number().int().positive(),
  // Set for production (webhook); leave empty in dev (long polling)
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().min(1).default("primary"),

  LANGUAGE: z.string().min(2).default("uk"),
  TIMEZONE: z.string().min(1).default("Europe/Kyiv"),
  CONTEXT_RETENTION_DAYS: z.coerce.number().int().positive().default(7),

  WEEK_START: z.enum(["monday", "sunday"]).default("monday"),

  WEEKLY_REMINDER_ENABLED: boolFromEnv(true),
  WEEKLY_REMINDER_TIME: timeOfDay("08:00"),
  DAILY_REMINDER_ENABLED: boolFromEnv(true),
  DAILY_REMINDER_TIME: timeOfDay("08:00"),
  EVENT_REMINDER_ENABLED: boolFromEnv(true),
  EVENT_REMINDER_MINUTES_BEFORE: z.coerce.number().int().positive().default(60),
  CALENDAR_POLL_MINUTES: z.coerce.number().int().positive().default(15),

  OLD_EVENTS_ACTION: z.enum(["keep", "delete"]).default("keep"),
  OLD_EVENTS_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  DATA_DIR: z.string().min(1).default("./data"),
});

export const env = envSchema.parse(process.env);

