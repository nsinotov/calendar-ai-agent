import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import { ONBOARDING_STEPS, remainingOnboardingSteps, SqliteUserSettingsStore } from "../memory/user-settings-store.js";
import { createSettingsTools } from "./settings-tools.js";
import type { Tool } from "./tool.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();
  const store = new SqliteUserSettingsStore(db);
  const tools = createSettingsTools({ settings: store, userId: 1, calendarProviders: ["google"] });
  const tool = (name: string): Tool => {
    const found = tools.find((candidate) => candidate.definition.name === name);
    assert.ok(found, `tool ${name} not found`);

    return found;
  };

  return { store, tool };
}

test("get_settings returns settings, available choices and the remaining onboarding steps", async () => {
  const { store, tool } = setup();
  store.markOnboardingSteps(1, ["name"]);
  const result = JSON.parse(await tool("get_settings").execute({})) as {
    settings: Record<string, unknown>;
    available: unknown;
    onboardingRemaining: string[];
  };

  assert.equal(result.settings.language, "uk");
  assert.equal("onboarding" in result.settings, false);
  assert.deepEqual(result.available, { calendarProviders: ["google"] });
  assert.deepEqual(result.onboardingRemaining, ONBOARDING_STEPS.filter((step) => step !== "name"));
});

test("update_settings changes only the given fields and confirms their onboarding steps", async () => {
  const { store, tool } = setup();

  await tool("update_settings").execute({ weekStart: "sunday", dailyReminderTime: "07:30" });

  assert.equal(store.get(1).weekStart, "sunday");
  assert.equal(store.get(1).dailyReminderTime, "07:30");
  assert.equal(store.get(1).language, "uk");
  assert.equal(store.get(1).onboarding.weekStart, true);
  assert.equal(store.get(1).onboarding.dailyReminder, true);
  assert.equal(store.get(1).onboarding.language, false);
});

test("update_settings rejects invalid values", async () => {
  const { tool } = setup();

  await assert.rejects(tool("update_settings").execute({ timezone: "Mars/Base" }), /Unknown IANA timezone/);
  await assert.rejects(tool("update_settings").execute({ dailyReminderTime: "8am" }), /HH:MM/);
  await assert.rejects(tool("update_settings").execute({ language: "not a language" }), /language code/);
  await assert.rejects(tool("update_settings").execute({}), /Nothing to change/);
});

test("update_settings only accepts registered calendar providers", async () => {
  const { store, tool } = setup();

  await assert.rejects(tool("update_settings").execute({ calendarProvider: "outlook" }), /Must be one of: google/);

  await tool("update_settings").execute({ calendarProvider: "google" });
  assert.equal(store.get(1).calendarProvider, "google");
});

test("update_settings cannot touch the name or the onboarding state", async () => {
  const { store, tool } = setup();

  await tool("update_settings").execute({
    weekStart: "sunday",
    name: "Hacker",
    onboarding: { name: true },
  });

  assert.equal(store.get(1).name, null);
  assert.equal(store.get(1).onboarding.name, false);
});

test("set_name records the name and completes the name step", async () => {
  const { store, tool } = setup();

  await tool("set_name").execute({ name: "  Olena " });

  assert.equal(store.get(1).name, "Olena");
  assert.equal(store.get(1).onboarding.name, true);
});

test("set_name without a name records a refusal and never invents a name", async () => {
  const { store, tool } = setup();

  await tool("set_name").execute({});

  assert.equal(store.get(1).name, null);
  assert.equal(store.get(1).onboarding.name, true);
});

test("accept_defaults confirms the given steps without changing values", async () => {
  const { store, tool } = setup();

  await tool("accept_defaults").execute({ steps: ["language", "timezone"] });

  assert.equal(store.get(1).language, "uk");
  assert.deepEqual(remainingOnboardingSteps(store.get(1)), ONBOARDING_STEPS.filter((step) => step !== "language" && step !== "timezone"));
});

test("accept_defaults without steps confirms every remaining step", async () => {
  const { store, tool } = setup();
  await tool("set_name").execute({ name: "Olena" });

  const result = await tool("accept_defaults").execute({});

  assert.equal(result, '{"onboardingRemaining":[]}');
  assert.deepEqual(remainingOnboardingSteps(store.get(1)), []);
  assert.equal(store.get(1).name, "Olena");
});

test("settings tools only touch the bound user", async () => {
  const { store, tool } = setup();

  await tool("update_settings").execute({ weekStart: "sunday" });
  await tool("set_name").execute({ name: "Olena" });
  await tool("accept_defaults").execute({});

  assert.equal(store.get(2).weekStart, "monday");
  assert.equal(store.get(2).name, null);
  assert.equal(remainingOnboardingSteps(store.get(2)).length, ONBOARDING_STEPS.length);
});

