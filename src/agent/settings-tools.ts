import { z } from "zod";
import {
  ONBOARDING_STEPS,
  onboardingStepsCovering,
  remainingOnboardingSteps,
  type UserSettings,
  type UserSettingsStore,
} from "../memory/user-settings-store.js";
import { defineTool, type Tool } from "./tool.js";

export interface SettingsToolsInput {
  settings: UserSettingsStore;
  userId: number;
  // Calendar providers the user has stored credentials for.
  calendarProviders: string[];
}

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

const timezone = z.string().refine(isValidTimezone, "Unknown IANA timezone");

const language = z.string().refine(isValidLanguage, "Expected a language code such as uk, en, de");

export function createSettingsTools(input: SettingsToolsInput): Tool[] {
  const { settings, userId } = input;
  const updateSchema = z
    .object({
      language: language.optional(),
      timezone: timezone.optional(),
      weekStart: z.enum(["monday", "sunday"]).optional(),
      contextRetentionDays: z.number().int().positive().optional(),
      weeklyReminderEnabled: z.boolean().optional(),
      weeklyReminderTime: timeOfDay.optional(),
      dailyReminderEnabled: z.boolean().optional(),
      dailyReminderTime: timeOfDay.optional(),
      eventReminderEnabled: z.boolean().optional(),
      eventReminderMinutesBefore: z.number().int().positive().optional(),
      oldEventsAction: z.enum(["keep", "delete"]).optional(),
      oldEventsRetentionDays: z.number().int().positive().optional(),
      calendarProvider: z.string().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.calendarProvider !== undefined && !input.calendarProviders.includes(value.calendarProvider)) {
        ctx.addIssue({
          code: "custom",
          path: ["calendarProvider"],
          message: `Must be one of: ${input.calendarProviders.join(", ") || "(none registered)"}`,
        });
      }
    });

  return [
    defineTool(
      {
        name: "get_settings",
        description:
          "Show the user's current settings, the choices available to them and which onboarding steps are still unconfirmed. Use it to walk the user through settings or to answer questions about them.",
        inputSchema: { type: "object", properties: {} },
      },
      z.object({}),
      () => {
        const current = settings.get(userId);

        return {
          settings: visibleSettings(current),
          available: { calendarProviders: input.calendarProviders },
          onboardingRemaining: remainingOnboardingSteps(current),
        };
      },
    ),
    defineTool(
      {
        name: "update_settings",
        description:
          "Change one or more of the user's settings. Only pass the fields the user wants to change. Times are HH:MM in the user's timezone. Changing a setting also confirms its onboarding step.",
        inputSchema: {
          type: "object",
          properties: {
            language: { type: "string", description: "Reply language code, e.g. uk, en." },
            timezone: { type: "string", description: "IANA timezone, e.g. Europe/Kyiv." },
            weekStart: { type: "string", enum: ["monday", "sunday"] },
            contextRetentionDays: { type: "number", description: "Days the conversation history is kept." },
            weeklyReminderEnabled: { type: "boolean" },
            weeklyReminderTime: { type: "string", description: "HH:MM" },
            dailyReminderEnabled: { type: "boolean" },
            dailyReminderTime: { type: "string", description: "HH:MM" },
            eventReminderEnabled: { type: "boolean" },
            eventReminderMinutesBefore: { type: "number", description: "Default lead time before timed events, in minutes." },
            oldEventsAction: { type: "string", enum: ["keep", "delete"], description: "What to do with events that already ended." },
            oldEventsRetentionDays: { type: "number", description: "Days to wait before old events are handled." },
            calendarProvider: { type: "string", description: `One of: ${input.calendarProviders.join(", ") || "(none registered)"}.` },
          },
        },
      },
      updateSchema,
      (patch) => {
        const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        const fields = Object.keys(changes);
        if (fields.length === 0) {
          throw new Error("Nothing to change: pass at least one setting");
        }

        settings.update(userId, changes);

        return { settings: visibleSettings(settings.markOnboardingSteps(userId, onboardingStepsCovering(fields))) };
      },
    ),
    defineTool(
      {
        name: "set_name",
        description:
          "Record the user's name, or record that they declined to give one (name omitted); both complete the name step of the onboarding. Can also be used later when the user asks to be called differently.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string", description: "Omit if the user declined." } },
        },
      },
      z.object({ name: z.string().trim().min(1).max(50).optional() }),
      ({ name }) => {
        settings.update(userId, { name: name ?? null });

        return { name: settings.markOnboardingSteps(userId, ["name"]).name };
      },
    ),
    defineTool(
      {
        name: "accept_defaults",
        description:
          "Confirm that the user is happy with the current (default) values of some onboarding steps, without changing them. Omit steps to confirm all remaining ones, but only after the user has agreed to the defaults you listed.",
        inputSchema: {
          type: "object",
          properties: {
            steps: { type: "array", items: { type: "string", enum: [...ONBOARDING_STEPS] } },
          },
        },
      },
      z.object({ steps: z.array(z.enum(ONBOARDING_STEPS)).min(1).optional() }),
      ({ steps }) => {
        const targets = steps ?? remainingOnboardingSteps(settings.get(userId));

        return { onboardingRemaining: remainingOnboardingSteps(settings.markOnboardingSteps(userId, targets)) };
      },
    ),
  ];
}

function visibleSettings(settings: UserSettings): Omit<UserSettings, "onboarding"> {
  const { onboarding: _onboarding, ...rest } = settings;

  return rest;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

function isValidLanguage(value: string): boolean {
  try {
    return /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(value) && Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

