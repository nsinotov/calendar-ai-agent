import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SCHEMA } from "../db/database.js";
import {
  ONBOARDING_STEP_FIELDS,
  ONBOARDING_STEPS,
  onboardingStepsCovering,
  remainingOnboardingSteps,
  SqliteUserSettingsStore,
} from "./user-settings-store.js";

function testStore(): SqliteUserSettingsStore {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0), (2, 0)").run();

  return new SqliteUserSettingsStore(db);
}

test("get() returns schema defaults when no row exists", () => {
  const store = testStore();
  const settings = store.get(1);

  assert.equal(settings.name, null);
  assert.deepEqual(remainingOnboardingSteps(settings), ONBOARDING_STEPS);
  assert.equal(settings.language, "uk");
  assert.equal(settings.weekStart, "monday");
});

test("update() merges a partial patch onto existing settings", () => {
  const store = testStore();
  store.update(1, { name: "Nikolay" });
  store.markOnboardingSteps(1, ["name"]);
  const settings = store.update(1, { weekStart: "sunday" });

  assert.equal(settings.name, "Nikolay");
  assert.equal(settings.onboarding.name, true);
  assert.equal(settings.weekStart, "sunday");
});

test("get() backfills a field missing from an older stored blob", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO users (telegram_user_id, created_at) VALUES (1, 0)").run();
  // Simulates a settings blob written before `oldEventsAction` existed.
  db.prepare("INSERT INTO user_settings (telegram_user_id, settings, updated_at) VALUES (1, ?, 0)").run(
    JSON.stringify({ name: "Nikolay" }),
  );
  const store = new SqliteUserSettingsStore(db);

  const settings = store.get(1);
  assert.equal(settings.name, "Nikolay");
  assert.equal(settings.oldEventsAction, "keep");
});

test("one user's settings are never visible to another user", () => {
  const store = testStore();
  store.update(1, { name: "Nikolay" });
  store.update(2, { name: "Kolya" });

  assert.equal(store.get(1).name, "Nikolay");
  assert.equal(store.get(2).name, "Kolya");
});

test("markOnboardingSteps() marks only the given steps and keeps earlier marks", () => {
  const store = testStore();
  store.markOnboardingSteps(1, ["name"]);
  const settings = store.markOnboardingSteps(1, ["timezone"]);

  assert.equal(settings.onboarding.name, true);
  assert.equal(settings.onboarding.timezone, true);
  assert.equal(settings.onboarding.language, false);
  assert.equal(remainingOnboardingSteps(settings).includes("name"), false);
  assert.equal(remainingOnboardingSteps(store.get(2)).length, ONBOARDING_STEPS.length);
});

test("onboardingStepsCovering() maps setting fields to their steps", () => {
  assert.deepEqual(onboardingStepsCovering(["dailyReminderTime", "language"]), ["language", "dailyReminder"]);
  assert.deepEqual(onboardingStepsCovering(["calendarProvider"]), []);
});

test("every onboarding step field is a real setting", () => {
  const settings = testStore().get(1);

  for (const fields of Object.values(ONBOARDING_STEP_FIELDS)) {
    for (const field of fields) {
      assert.ok(field in settings, `${field} is not a setting`);
    }
  }
});

