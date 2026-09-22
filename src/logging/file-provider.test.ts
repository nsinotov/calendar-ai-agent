import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileLogProvider } from "./file-provider.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "calendar-ai-agent-log-test-"));
}

test("writes one JSON line per entry, in today's file", () => {
  const dir = tempDir();

  try {
    const provider = new FileLogProvider(dir, 14);
    const timestamp = new Date().toISOString();
    provider.write({ timestamp, level: "info", message: "hello", context: { a: 1 } });

    const today = timestamp.slice(0, 10);
    const lines = readFileSync(join(dir, `${today}.log`), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]!), { timestamp, level: "info", message: "hello", context: { a: 1 } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fresh provider sweeps log files past the retention window", () => {
  const dir = tempDir();

  try {
    writeFileSync(join(dir, "2000-01-01.log"), "old\n");
    writeFileSync(join(dir, "not-a-log-file.txt"), "keep me\n");

    const provider = new FileLogProvider(dir, 3);
    provider.write({ timestamp: new Date().toISOString(), level: "info", message: "trigger cleanup" });

    const remaining = readdirSync(dir).sort();
    assert.ok(!remaining.includes("2000-01-01.log"), "stale log file should be deleted");
    assert.ok(remaining.includes("not-a-log-file.txt"), "non-log files are left alone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

