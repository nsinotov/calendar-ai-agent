import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserSettings } from "../memory/user-settings-store.js";
import { buildSystemPrompt } from "./system-prompt.js";

const settings = {
  name: null,
  onboarding: {
    name: true,
    language: true,
    timezone: true,
    weekStart: true,
    contextRetention: true,
    weeklyReminder: true,
    dailyReminder: true,
    eventReminder: true,
    oldEvents: true,
  },
  language: "uk",
  timezone: "Europe/Kyiv",
  weekStart: "monday",
} as UserSettings;

const now = new Date("2026-09-24T12:00:00Z");
const toolResultRetentionMinutes = 60;

test("includes the local time with weekday and UTC offset", () => {
  const prompt = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });

  assert.match(prompt, /Thursday, 2026-09-24T15:00:00\+03:00 \(Europe\/Kyiv\)/);
});

test("uses +00:00 for UTC", () => {
  const prompt = buildSystemPrompt({ settings: { ...settings, timezone: "UTC" }, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });

  assert.match(prompt, /2026-09-24T12:00:00\+00:00/);
});

test("names the reply language and the week start", () => {
  const prompt = buildSystemPrompt({ settings: { ...settings, weekStart: "sunday" }, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });

  assert.match(prompt, /Reply in Ukrainian/);
  assert.match(prompt, /week starts on Sunday/);
});

test("uses the name when known and forbids inventing one otherwise", () => {
  const named = buildSystemPrompt({ settings: { ...settings, name: "Olena" }, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });
  const anonymous = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });

  assert.match(named, /name is Olena/);
  assert.match(anonymous, /Never invent one/);
});

test("lists opted-in topics only when configured", () => {
  const without = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });
  const withTopics = buildSystemPrompt({ settings, allowedTopics: ["weather", "cooking"], preferences: [], toolResultRetentionMinutes, now });

  assert.doesNotMatch(without, /may also help/);
  assert.match(withTopics, /may also help with these topics: weather, cooking/);
});

test("lists stored preferences with their ids, and omits the section when there are none", () => {
  const none = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });
  const some = buildSystemPrompt({
    settings,
    allowedTopics: [],
    preferences: [{ id: 7, text: "Delete without asking for confirmation." }],
    toolResultRetentionMinutes,
    now,
  });

  assert.doesNotMatch(none, /User preferences/);
  assert.match(some, /User preferences[^\n]*\n- \[id 7\] Delete without asking for confirmation\./);
});

test("includes the activity summary only when provided", () => {
  const without = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });
  const withSummary = buildSystemPrompt({
    settings,
    allowedTopics: [],
    preferences: [],
    activitySummary: "Visited the dentist last week.",
    toolResultRetentionMinutes,
    now,
  });

  assert.doesNotMatch(without, /recent activities/);
  assert.match(withSummary, /recent activities[^\n]*\nVisited the dentist last week\./);
});

test("states the chat-history and tool-result memory limits so the agent can tell the user about them", () => {
  const prompt = buildSystemPrompt({
    settings: { ...settings, contextRetentionDays: 7 },
    allowedTopics: [],
    preferences: [],
    toolResultRetentionMinutes: 90,
    now,
  });

  assert.match(prompt, /Chat history is kept for 7 day\(s\)/);
  assert.match(prompt, /Calendar\/tool data seen earlier[^\n]*90 minutes/);
});

test("formats a whole-hour tool-result retention in hours", () => {
  const prompt = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes: 120, now });

  assert.match(prompt, /2 hours after it was fetched/);
});

test("lists the unconfirmed onboarding steps with defaults, and drops the section when all are confirmed", () => {
  const partial = { ...settings, onboarding: { ...settings.onboarding, name: false, timezone: false } };
  const during = buildSystemPrompt({ settings: partial, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });
  const done = buildSystemPrompt({ settings, allowedTopics: [], preferences: [], toolResultRetentionMinutes, now });

  assert.match(during, /Onboarding/);
  assert.match(during, /- name: /);
  assert.match(during, /- timezone: timezone \(default: Europe\/Kyiv\)/);
  assert.doesNotMatch(during, /- language: /);
  assert.match(during, /accept_defaults/);
  assert.doesNotMatch(done, /Onboarding/);
});

