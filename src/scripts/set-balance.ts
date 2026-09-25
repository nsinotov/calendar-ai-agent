// Sets the tracked LLM balance after a top-up: `pnpm set-balance <usd>`. Run on the server.
// The running app picks the new value up immediately and re-arms the balance warnings.
import { env } from "../config/env.js";
import { createStorage } from "../db/index.js";

const amount = Number(process.argv[2]);
if (!Number.isFinite(amount) || amount < 0) {
  throw new Error("Usage: pnpm set-balance <usd>, e.g. pnpm set-balance 20");
}

const storage = createStorage({
  provider: env.STORAGE_PROVIDER,
  dataDir: env.DATA_DIR,
  encryptionKeyHex: env.SECRETS_ENCRYPTION_KEY,
});
storage.billing.setBalance(amount);
storage.close();

console.log(`LLM balance set to $${amount.toFixed(2)}.`);

