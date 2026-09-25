import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, localParts, minutesOfDay, startOfLocalDay } from "./local-time.js";

test("localParts() gives the local date, time and weekday", () => {
  // 2026-09-25 22:30 UTC is already Saturday 01:30 in Kyiv (UTC+3).
  assert.deepEqual(localParts(new Date("2026-09-25T22:30:00Z"), "Europe/Kyiv"), {
    date: "2026-09-26",
    time: "01:30",
    weekday: "saturday",
  });
});

test("localParts() renders midnight as 00:00", () => {
  assert.equal(localParts(new Date("2026-09-25T21:00:00Z"), "Europe/Kyiv").time, "00:00");
});

test("startOfLocalDay() returns the UTC instant the local day starts", () => {
  assert.equal(startOfLocalDay("2026-09-25", "Europe/Kyiv").toISOString(), "2026-09-24T21:00:00.000Z");
  assert.equal(startOfLocalDay("2026-09-25", "America/New_York").toISOString(), "2026-09-25T04:00:00.000Z");
});

test("startOfLocalDay() is right across a DST change", () => {
  // Kyiv leaves summer time on 2026-10-25, so that day starts at UTC+3 but ends at UTC+2.
  assert.equal(startOfLocalDay("2026-10-25", "Europe/Kyiv").toISOString(), "2026-10-24T21:00:00.000Z");
  assert.equal(startOfLocalDay("2026-10-26", "Europe/Kyiv").toISOString(), "2026-10-25T22:00:00.000Z");
});

test("addDays() moves across month ends", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-09-25", 7), "2026-10-02");
});

test("minutesOfDay() parses HH:MM", () => {
  assert.equal(minutesOfDay("08:30"), 510);
});

