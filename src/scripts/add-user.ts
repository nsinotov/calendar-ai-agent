// Interactive setup script, run on the server: `pnpm add-user`.
// Registers a Telegram user, their preferences, and their calendar
// credentials (encrypted). Not exposed as a chat command - the admin runs
// this directly, so secrets never pass through Telegram or the LLM.
import { createInterface } from "node:readline/promises";
import { env } from "../config/env.js";
import { calendarCredentialFields } from "../calendar/index.js";
import { createStorage } from "../db/index.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();

  return answer || fallback || "";
}

async function main(): Promise<void> {
  const storage = createStorage({
    provider: "sqlite",
    dataDir: env.DATA_DIR,
    encryptionKeyHex: env.SECRETS_ENCRYPTION_KEY,
  });
  const { users: userStore, settings: settingsStore, secrets: secretsStore } = storage;

  const idInput = await ask("Telegram user ID (from @userinfobot)");
  const userId = Number(idInput);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`Invalid Telegram user ID: "${idInput}"`);
  }

  const role = (await ask("Role (admin/user)", "user")) === "admin" ? "admin" : "user";
  const name = await ask("Name (leave empty to skip)");
  const language = await ask("Language (ISO code)", "uk");
  const timezone = await ask("Timezone (IANA name)", "Europe/Kyiv");
  const weekStart = (await ask("Week start (monday/sunday)", "monday")) === "sunday" ? "sunday" : "monday";

  const providers = Object.keys(calendarCredentialFields);
  const calendarProvider = await ask(`Calendar provider (${providers.join("/")}, empty to skip)`);
  if (calendarProvider && !providers.includes(calendarProvider)) {
    throw new Error(`Unknown calendar provider: "${calendarProvider}"`);
  }

  const credentials: Record<string, string> = {};
  for (const field of calendarProvider ? calendarCredentialFields[calendarProvider]! : []) {
    credentials[field.key] = await ask(field.prompt, field.default);
  }

  userStore.upsert(userId, role);
  settingsStore.update(userId, {
    ...(name && { name }),
    language,
    timezone,
    weekStart,
    calendarProvider: calendarProvider || null,
  });
  // Answers given here are confirmed; anything left empty is still asked during onboarding.
  settingsStore.markOnboardingSteps(userId, name ? ["name", "language", "timezone", "weekStart"] : ["language", "timezone", "weekStart"]);
  if (calendarProvider) {
    secretsStore.set(userId, "calendar", calendarProvider, credentials);
  }

  console.log(`\nUser ${userId} saved.`);
  rl.close();
  storage.close();
}

await main();

