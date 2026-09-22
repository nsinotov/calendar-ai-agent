import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "../logging/index.js";
import { CalendarError } from "./errors.js";
import { LoggingCalendarProvider } from "./logging-provider.js";
import type { CalendarEvent, CalendarProvider } from "./types.js";

function fakeLogger(): Logger & { calls: [string, string, Record<string, unknown> | undefined][] } {
  const calls: [string, string, Record<string, unknown> | undefined][] = [];

  return {
    calls,
    error: (message, context) => calls.push(["error", message, context]),
    warn: (message, context) => calls.push(["warn", message, context]),
    info: (message, context) => calls.push(["info", message, context]),
    debug: (message, context) => calls.push(["debug", message, context]),
  };
}

const sampleEvent: CalendarEvent = {
  id: "e1",
  title: "Doctor",
  start: { allDay: false, value: "2026-10-01T09:00:00+03:00" },
  end: { allDay: false, value: "2026-10-01T09:30:00+03:00" },
  status: "confirmed",
};

test("listEvents() logs a debug request, then an info response with just the count", async () => {
  const inner: CalendarProvider = {
    listEvents: async () => [sampleEvent],
    createEvent: async () => sampleEvent,
    updateEvent: async () => sampleEvent,
    deleteEvent: async () => {},
  };
  const logger = fakeLogger();
  const provider = new LoggingCalendarProvider(inner, logger);

  await provider.listEvents({});

  const levels = logger.calls.map(([level]) => level);
  assert.deepEqual(levels, ["debug", "info"]);

  const [, , infoContext] = logger.calls[1]!;
  assert.equal(infoContext?.count, 1);
  assert.ok(!("title" in (infoContext ?? {})), "info log must not carry event content");
});

test("createEvent() failure logs the CalendarError kind and rethrows", async () => {
  const inner: CalendarProvider = {
    listEvents: async () => [],
    createEvent: async () => {
      throw new CalendarError("rate_limit", "slow down");
    },
    updateEvent: async () => sampleEvent,
    deleteEvent: async () => {},
  };
  const logger = fakeLogger();
  const provider = new LoggingCalendarProvider(inner, logger);

  await assert.rejects(
    provider.createEvent({ title: "x", start: sampleEvent.start, end: sampleEvent.end }),
    (error: unknown) => error instanceof CalendarError && error.kind === "rate_limit",
  );

  const [level, , context] = logger.calls.at(-1)!;
  assert.equal(level, "error");
  assert.equal(context?.kind, "rate_limit");
});

