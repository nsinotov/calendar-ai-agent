import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const timeOfDay = (fallback: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM").default(fallback);

// Every field has a default, so a settings blob written before a field
// existed still parses correctly - new settings never need a migration.
const userSettingsSchema = z.object({
  name: z.string().min(1).nullable().default(null),
  // Whether the agent has already asked for the name - don't ask twice.
  askedForName: z.boolean().default(false),

  language: z.string().min(2).default("uk"),
  timezone: z.string().min(1).default("Europe/Kyiv"),
  weekStart: z.enum(["monday", "sunday"]).default("monday"),
  contextRetentionDays: z.number().int().positive().default(7),

  weeklyReminderEnabled: z.boolean().default(true),
  weeklyReminderTime: timeOfDay("08:00"),
  dailyReminderEnabled: z.boolean().default(true),
  dailyReminderTime: timeOfDay("08:00"),
  eventReminderEnabled: z.boolean().default(true),
  eventReminderMinutesBefore: z.number().int().positive().default(60),

  oldEventsAction: z.enum(["keep", "delete"]).default("keep"),
  oldEventsRetentionDays: z.number().int().positive().default(30),

  llmProvider: z.enum(["anthropic", "openai"]).default("anthropic"),
  llmModel: z.string().min(1).default("claude-sonnet-5"),

  // Which registered calendar provider (see UserSecretsStore.listProviders) is active.
  calendarProvider: z.string().nullable().default(null),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export interface UserSettingsStore {
  get(userId: number): UserSettings;
  update(userId: number, patch: Partial<UserSettings>): UserSettings;
}

interface SettingsRow {
  settings: string;
}

export class SqliteUserSettingsStore implements UserSettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: number): UserSettings {
    const row = this.db
      .prepare("SELECT settings FROM user_settings WHERE telegram_user_id = ?")
      .get(userId) as SettingsRow | undefined;

    if (!row) {
      return userSettingsSchema.parse({});
    }

    return userSettingsSchema.parse(JSON.parse(row.settings));
  }

  update(userId: number, patch: Partial<UserSettings>): UserSettings {
    const merged = { ...this.get(userId), ...patch };
    const validated = userSettingsSchema.parse(merged);

    this.db
      .prepare(
        `INSERT INTO user_settings (telegram_user_id, settings, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(telegram_user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(validated), Date.now());

    return validated;
  }
}

