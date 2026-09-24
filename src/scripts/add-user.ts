// Interactive setup script, run on the server: `pnpm add-user`.
// Registers a Telegram user, their preferences, and their Google Calendar
// refresh token (encrypted). Not exposed as a chat command - the admin runs
// this directly, so secrets never pass through Telegram or the LLM.
import { createInterface } from "node:readline/promises";
import { env } from "../config/env.js";
import { openDatabase } from "../db/database.js";
import { SqliteUserSettingsStore } from "../memory/user-settings-store.js";
import { loadEncryptionKey } from "../secrets/crypto.js";
import { SqliteUserSecretsStore } from "../secrets/user-secrets-store.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();

  return answer || fallback || "";
}

async function main(): Promise<void> {
  const db = openDatabase(env.DATA_DIR);
  const settingsStore = new SqliteUserSettingsStore(db);
  const secretsStore = new SqliteUserSecretsStore(db, loadEncryptionKey(env.SECRETS_ENCRYPTION_KEY));

  const idInput = await ask("Telegram user ID (from @userinfobot)");
  const userId = Number(idInput);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`Invalid Telegram user ID: "${idInput}"`);
  }

  const name = await ask("Name (leave empty to skip)");
  const language = await ask("Language (ISO code)", "uk");
  const timezone = await ask("Timezone (IANA name)", "Europe/Kyiv");
  const weekStart = (await ask("Week start (monday/sunday)", "monday")) === "sunday" ? "sunday" : "monday";

  console.log("\nGoogle Calendar - run the OAuth flow separately to get a refresh token, then paste it here.");
  const refreshToken = await ask("Google refresh token");
  const calendarId = await ask("Google calendar ID", "primary");

  db.prepare("INSERT OR IGNORE INTO users (telegram_user_id, created_at) VALUES (?, ?)").run(
    userId,
    Date.now(),
  );
  settingsStore.update(userId, {
    ...(name && { name }),
    language,
    timezone,
    weekStart,
    calendarProvider: refreshToken ? "google" : null,
  });
  // Answers given here are confirmed; anything left empty is still asked during onboarding.
  settingsStore.markOnboardingSteps(userId, name ? ["name", "language", "timezone", "weekStart"] : ["language", "timezone", "weekStart"]);
  if (refreshToken) {
    secretsStore.set(userId, "calendar", "google", { refreshToken, calendarId: calendarId || "primary" });
  }

  console.log(`\nUser ${userId} saved.`);
  rl.close();
}

await main();

