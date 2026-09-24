import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserSettings } from "../memory/user-settings-store.js";
import { buildSystemPrompt } from "./system-prompt.js";

const settings = {
  name: null,
  language: "uk",
  timezone: "Europe/Kyiv",
  weekStart: "monday",
} as UserSettings;

const now = new Date("2026-09-24T12:00:00Z");

test("includes the local time with weekday and UTC offset", () => {
  const prompt = buildSystemPrompt({ settings, allowedTopics: [], now });

  assert.match(prompt, /Thursday, 2026-09-24T15:00:00\+03:00 \(Europe\/Kyiv\)/);
});

test("uses +00:00 for UTC", () => {
  const prompt = buildSystemPrompt({ settings: { ...settings, timezone: "UTC" }, allowedTopics: [], now });

  assert.match(prompt, /2026-09-24T12:00:00\+00:00/);
});

test("names the reply language and the week start", () => {
  const prompt = buildSystemPrompt({ settings: { ...settings, weekStart: "sunday" }, allowedTopics: [], now });

  assert.match(prompt, /Reply in Ukrainian/);
  assert.match(prompt, /week starts on Sunday/);
});

test("uses the name when known and forbids inventing one otherwise", () => {
  const named = buildSystemPrompt({ settings: { ...settings, name: "Olena" }, allowedTopics: [], now });
  const anonymous = buildSystemPrompt({ settings, allowedTopics: [], now });

  assert.match(named, /name is Olena/);
  assert.match(anonymous, /Never invent one/);
});

test("lists opted-in topics only when configured", () => {
  const without = buildSystemPrompt({ settings, allowedTopics: [], now });
  const withTopics = buildSystemPrompt({ settings, allowedTopics: ["weather", "cooking"], now });

  assert.doesNotMatch(without, /may also help/);
  assert.match(withTopics, /may also help with these topics: weather, cooking/);
});

