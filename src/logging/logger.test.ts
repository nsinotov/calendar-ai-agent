import assert from "node:assert/strict";
import { test } from "node:test";
import { CompositeLogger } from "./logger.js";
import type { LogEntry, LogProvider } from "./types.js";

function recordingProvider(): LogProvider & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];

  return { entries, write: (entry) => entries.push(entry) };
}

test("only dispatches levels that are enabled", () => {
  const provider = recordingProvider();
  const logger = new CompositeLogger({ providers: [provider], levels: new Set(["error", "info"]), debugEnabled: false });

  logger.error("e");
  logger.warn("w");
  logger.info("i");
  logger.debug("d");

  assert.deepEqual(
    provider.entries.map((entry) => entry.level),
    ["error", "info"],
  );
});

test("debug is gated by its own flag, independent of levels", () => {
  const provider = recordingProvider();
  const logger = new CompositeLogger({ providers: [provider], levels: new Set(), debugEnabled: true });

  logger.error("should be dropped, error not in levels");
  logger.debug("d", { note: "buy milk" });

  assert.deepEqual(
    provider.entries.map((entry) => entry.level),
    ["debug"],
  );
  assert.equal(provider.entries[0]?.context?.note, "buy milk");
});

test("a failing provider does not stop other providers or throw", () => {
  const good = recordingProvider();
  const bad: LogProvider = {
    write: () => {
      throw new Error("disk full");
    },
  };
  const logger = new CompositeLogger({ providers: [bad, good], levels: new Set(["info"]), debugEnabled: false });

  assert.doesNotThrow(() => logger.info("still works"));
  assert.equal(good.entries.length, 1);
});

