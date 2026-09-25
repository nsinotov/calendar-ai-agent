import type { DatabaseSync } from "node:sqlite";

export interface BillingState {
  // Null while no balance is tracked.
  balanceUsd: number | null;
  // A low-balance warning was already sent for the current crossing.
  lowNotified: boolean;
  // The LLM provider reported no credits and users were notified.
  outage: boolean;
}

export interface BillingStore {
  get(): BillingState;
  // A top-up: also clears the low-balance and outage flags.
  setBalance(usd: number): void;
  // No-op while no balance is tracked.
  deduct(usd: number): void;
  setLowNotified(value: boolean): void;
  setOutage(value: boolean): void;
}

interface BillingRow {
  balance_usd: number | null;
  low_notified: number;
  outage: number;
}

export class SqliteBillingStore implements BillingStore {
  constructor(private readonly db: DatabaseSync) {
    db.prepare("INSERT OR IGNORE INTO llm_billing (id, updated_at) VALUES (1, ?)").run(Date.now());
  }

  get(): BillingState {
    const row = this.db
      .prepare("SELECT balance_usd, low_notified, outage FROM llm_billing WHERE id = 1")
      .get() as unknown as BillingRow;

    return { balanceUsd: row.balance_usd, lowNotified: row.low_notified === 1, outage: row.outage === 1 };
  }

  setBalance(usd: number): void {
    this.db
      .prepare("UPDATE llm_billing SET balance_usd = ?, low_notified = 0, outage = 0, updated_at = ? WHERE id = 1")
      .run(usd, Date.now());
  }

  deduct(usd: number): void {
    this.db
      .prepare("UPDATE llm_billing SET balance_usd = balance_usd - ?, updated_at = ? WHERE id = 1 AND balance_usd IS NOT NULL")
      .run(usd, Date.now());
  }

  setLowNotified(value: boolean): void {
    this.db.prepare("UPDATE llm_billing SET low_notified = ?, updated_at = ? WHERE id = 1").run(value ? 1 : 0, Date.now());
  }

  setOutage(value: boolean): void {
    this.db.prepare("UPDATE llm_billing SET outage = ?, updated_at = ? WHERE id = 1").run(value ? 1 : 0, Date.now());
  }
}

