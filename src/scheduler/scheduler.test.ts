import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CalendarProvider } from "../calendar/index.js";
import { SCHEMA } from "../db/database.js";
import type { Logger } from "../logging/index.js";
import { SqliteUserSettingsStore } from "../memory/user-settings-store.js";
import { SqliteUserStore } from "../memory/user-store.js";
import { Scheduler } from "./scheduler.js";
import type { Job } from "./types.js";

const calendar = {} as CalendarProvider;

function setup(resolve: (userId: number) => CalendarProvider | null, jobs: Job[]) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const users = new SqliteUserStore(db);
  users.upsert(1, "user");
  users.upsert(2, "user");
  const errors: Record<string, unknown>[] = [];
  const logger: Logger = { error: (_message, context) => void errors.push(context ?? {}), warn() {}, info() {}, debug() {} };
  const scheduler = new Scheduler({ users, settings: new SqliteUserSettingsStore(db), resolveCalendar: resolve, jobs, logger }, 60_000);

  return { scheduler, errors };
}

test("every job runs for every user that has a calendar", async () => {
  const seen: string[] = [];
  const job: Job = { name: "j", run: async ({ userId }) => void seen.push(`j${userId}`) };
  const { scheduler } = setup((userId) => (userId === 1 ? calendar : null), [job]);

  await scheduler.tick();

  assert.deepEqual(seen, ["j1"]);
});

test("a failing job is logged and the other jobs and users still run", async () => {
  const seen: string[] = [];
  const failing: Job = {
    name: "failing",
    run: async () => {
      throw new Error("boom");
    },
  };
  const ok: Job = { name: "ok", run: async ({ userId }) => void seen.push(`ok${userId}`) };
  const { scheduler, errors } = setup(() => calendar, [failing, ok]);

  await scheduler.tick();

  assert.deepEqual(seen, ["ok1", "ok2"]);
  assert.equal(errors.length, 2);
  assert.equal(errors[0]!.job, "failing");
});

test("a user whose calendar cannot be built is logged and skipped", async () => {
  const seen: string[] = [];
  const job: Job = { name: "j", run: async ({ userId }) => void seen.push(`j${userId}`) };
  const { scheduler, errors } = setup(
    (userId) => {
      if (userId === 1) {
        throw new Error("bad credentials");
      }

      return calendar;
    },
    [job],
  );

  await scheduler.tick();

  assert.deepEqual(seen, ["j2"]);
  assert.equal(errors[0]!.job, "setup");
});

test("overlapping ticks do not run the jobs twice", async () => {
  let runs = 0;
  let release: () => void = () => {};
  const job: Job = {
    name: "slow",
    run: () => {
      runs++;

      return new Promise<void>((resolve) => (release = resolve));
    },
  };
  const { scheduler } = setup((userId) => (userId === 1 ? calendar : null), [job]);

  const first = scheduler.tick();
  await scheduler.tick();
  release();
  await first;

  assert.equal(runs, 1);
});

