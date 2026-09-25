import {
  buildSystemPrompt,
  createCalendarTools,
  createCapabilitiesTool,
  createNotesTools,
  createPreferencesTools,
  createReminderTools,
  createSettingsTools,
  createSuggestionTools,
  type AgentContext,
  type Tool,
} from "../agent/index.js";
import type { CalendarProvider } from "../calendar/index.js";
import type { Storage } from "../db/index.js";
import type { LlmProvider } from "../llm/types.js";
import { canUse, type Command } from "./commands.js";

export interface AgentContextDeps {
  storage: Pick<Storage, "users" | "eventReminders" | "settings" | "preferences" | "notes" | "activity" | "secrets">;
  commands: Command[];
  llm: LlmProvider;
  resolveCalendar: (userId: number) => CalendarProvider | null;
  allowedTopics: string[];
  suggestionsEnabled: boolean;
  now?: () => Date;
}

// Builds the system prompt and the tool set for one user from their current settings.
export function createAgentContextBuilder(deps: AgentContextDeps): (userId: number) => AgentContext {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());

  return (userId) => {
    const settings = storage.settings.get(userId);
    const calendar = deps.resolveCalendar(userId);

    const tools: Tool[] = [
      ...(calendar ? createCalendarTools(calendar, { timezone: settings.timezone, now }) : []),
      ...createNotesTools(storage.notes, userId),
      ...createPreferencesTools(storage.preferences, userId),
      ...(calendar ? createReminderTools(storage.eventReminders, userId) : []),
      ...createSettingsTools({
        settings: storage.settings,
        userId,
        calendarProviders: storage.secrets.listProviders(userId, "calendar"),
      }),
    ];
    if (deps.suggestionsEnabled && calendar) {
      tools.push(
        ...createSuggestionTools({
          llm: deps.llm,
          calendar,
          notes: storage.notes,
          store: storage.activity,
          userId,
          language: settings.language,
          now,
        }),
      );
    }

    const role = storage.users.get(userId)?.role ?? "user";
    const availableCommands = deps.commands.filter((command) => canUse(role, command));

    return {
      system: buildSystemPrompt({
        settings,
        allowedTopics: deps.allowedTopics,
        preferences: storage.preferences.list(userId),
        activitySummary: deps.suggestionsEnabled ? storage.activity.get(userId) : undefined,
        now: now(),
      }),
      tools: [...tools, createCapabilitiesTool(tools, availableCommands)],
      retentionDays: settings.contextRetentionDays,
    };
  };
}

