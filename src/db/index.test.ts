import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStorage } from "./index.js";

test("createStorage() returns stores that share one database", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "storage-"));
  const storage = createStorage({
    provider: "sqlite",
    dataDir,
    encryptionKeyHex: "0".repeat(64),
  });

  try {
    storage.users.upsert(1, "admin");
    storage.notes.add(1, { text: "buy milk", context: "market" });
    storage.secrets.set(1, "calendar", "google", { refreshToken: "token" });
    storage.preferences.add(1, "Delete without asking.");

    assert.equal(storage.users.get(1)?.role, "admin");
    assert.equal(storage.notes.list(1).length, 1);
    assert.deepEqual(storage.secrets.get(1, "calendar", "google"), { refreshToken: "token" });
    assert.equal(storage.preferences.list(1).length, 1);
  } finally {
    storage.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

