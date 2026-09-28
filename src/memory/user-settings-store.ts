import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const DEFAULT_LANGUAGE = "uk";
const DEFAULT_TIMEZONE = "Europe/Kyiv";
const DEFAULT_WEEK_START = "monday";
const DEFAULT_CONTEXT_RETENTION_DAYS = 7;
const DEFAULT_REMINDER_ENABLED = true;
const DEFAULT_REMINDER_TIME = "08:00";
const DEFAULT_EVENT_REMINDER_MINUTES_BEFORE = 60;
const DEFAULT_OLD_EVENTS_ACTION = "keep";
const DEFAULT_OLD_EVENTS_RETENTION_DAYS = 30;

const timeOfDay = (fallback: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM").default(fallback);

// Onboarding steps and the settings fields each one covers. A step counts as set once the
// user answered it (a value or "keep the default"), so the agent knows what is still open.
export const ONBOARDING_STEP_FIELDS = {
  name: ["name"],
  language: ["language"],
  timezone: ["timezone"],
  weekStart: ["weekStart"],
  contextRetention: ["contextRetentionDays"],
  weeklyReminder: ["weeklyReminderEnabled", "weeklyReminderTime"],
  dailyReminder: ["dailyReminderEnabled", "dailyReminderTime"],
  eventReminder: ["eventReminderEnabled", "eventReminderMinutesBefore"],
  oldEvents: ["oldEventsAction", "oldEventsRetentionDays"],
} as const;

export type OnboardingStep = keyof typeof ONBOARDING_STEP_FIELDS;

export const ONBOARDING_STEPS = Object.keys(ONBOARDING_STEP_FIELDS) as [OnboardingStep, ...OnboardingStep[]];

const onboardingSchema = z.object(
  Object.fromEntries(ONBOARDING_STEPS.map((step) => [step, z.boolean().default(false)])),
) as z.ZodObject<Record<OnboardingStep, z.ZodDefault<z.ZodBoolean>>>;

// Every field has a default, so a settings blob written before a field
// existed still parses correctly - new settings never need a migration.
function buildUserSettingsSchema(defaultContextRetentionDays: number) {
  return z.object({
    name: z.string().min(1).nullable().default(null),
    onboarding: onboardingSchema.default({}),

    language: z.string().min(2).default(DEFAULT_LANGUAGE),
    timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
    weekStart: z.enum(["monday", "sunday"]).default(DEFAULT_WEEK_START),
    contextRetentionDays: z.number().int().positive().default(defaultContextRetentionDays),

    weeklyReminderEnabled: z.boolean().default(DEFAULT_REMINDER_ENABLED),
    weeklyReminderTime: timeOfDay(DEFAULT_REMINDER_TIME),
    dailyReminderEnabled: z.boolean().default(DEFAULT_REMINDER_ENABLED),
    dailyReminderTime: timeOfDay(DEFAULT_REMINDER_TIME),
    eventReminderEnabled: z.boolean().default(DEFAULT_REMINDER_ENABLED),
    eventReminderMinutesBefore: z.number().int().positive().default(DEFAULT_EVENT_REMINDER_MINUTES_BEFORE),

    oldEventsAction: z.enum(["keep", "delete"]).default(DEFAULT_OLD_EVENTS_ACTION),
    oldEventsRetentionDays: z.number().int().positive().default(DEFAULT_OLD_EVENTS_RETENTION_DAYS),

    // Which registered calendar provider (see UserSecretsStore.listProviders) is active.
    calendarProvider: z.string().nullable().default(null),
  });
}

export type UserSettings = z.infer<ReturnType<typeof buildUserSettingsSchema>>;

export interface UserSettingsStore {
  get(userId: number): UserSettings;
  update(userId: number, patch: Partial<UserSettings>): UserSettings;
  markOnboardingSteps(userId: number, steps: readonly OnboardingStep[]): UserSettings;
}

export function remainingOnboardingSteps(settings: UserSettings): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => !settings.onboarding[step]);
}

// Steps whose settings appear in the patch.
export function onboardingStepsCovering(fields: readonly string[]): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) =>
    ONBOARDING_STEP_FIELDS[step].some((field) => fields.includes(field)),
  );
}

interface SettingsRow {
  settings: string;
}

export class SqliteUserSettingsStore implements UserSettingsStore {
  private readonly schema: ReturnType<typeof buildUserSettingsSchema>;

  constructor(
    private readonly db: DatabaseSync,
    defaultContextRetentionDays = DEFAULT_CONTEXT_RETENTION_DAYS,
  ) {
    this.schema = buildUserSettingsSchema(defaultContextRetentionDays);
  }

  get(userId: number): UserSettings {
    const row = this.db
      .prepare("SELECT settings FROM user_settings WHERE telegram_user_id = ?")
      .get(userId) as SettingsRow | undefined;

    if (!row) {
      return this.schema.parse({});
    }

    return this.schema.parse(JSON.parse(row.settings));
  }

  update(userId: number, patch: Partial<UserSettings>): UserSettings {
    const merged = { ...this.get(userId), ...patch };
    const validated = this.schema.parse(merged);

    this.db
      .prepare(
        `INSERT INTO user_settings (telegram_user_id, settings, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(telegram_user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(validated), Date.now());

    return validated;
  }

  markOnboardingSteps(userId: number, steps: readonly OnboardingStep[]): UserSettings {
    const onboarding = { ...this.get(userId).onboarding };
    for (const step of steps) {
      onboarding[step] = true;
    }

    return this.update(userId, { onboarding });
  }
}

