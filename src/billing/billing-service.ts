import { LlmError } from "../llm/errors.js";
import type { LlmUsage } from "../llm/types.js";
import type { BillingStore } from "./billing-store.js";

export const OUTAGE_USER_TEXT =
  "The AI assistant is temporarily unavailable: the service is out of credits. The administrator has been notified.";

export interface Notifier {
  notifyAdmins(text: string): Promise<void>;
  // Every registered user, admins included.
  broadcast(text: string): Promise<void>;
}

export interface BillingConfig {
  // Prices in USD per 1M tokens; null disables spend tracking (outage handling still works).
  prices: { inputPerMtok: number; outputPerMtok: number } | null;
  lowBalanceUsd: number;
  // During an outage one request per interval is let through to find out whether the LLM recovered.
  probeIntervalMs: number;
}

export class BillingService {
  private lastProbeAt = 0;

  constructor(
    private readonly store: BillingStore,
    private readonly notifier: Notifier,
    private readonly config: BillingConfig,
    private readonly now: () => number = Date.now,
  ) {}

  balanceUsd(): number | null {
    return this.config.prices ? this.store.get().balanceUsd : null;
  }

  // A top-up: also clears the low-balance and outage flags.
  setBalance(usd: number): void {
    this.store.setBalance(usd);
  }

  isOutage(): boolean {
    return this.store.get().outage;
  }

  // True while requests should get the static outage reply instead of reaching the LLM.
  blocksRequests(): boolean {
    if (!this.isOutage()) {
      return false;
    }
    if (this.now() - this.lastProbeAt >= this.config.probeIntervalMs) {
      this.lastProbeAt = this.now();

      return false;
    }

    return true;
  }

  recordSuccess(usage: LlmUsage): void {
    if (this.isOutage()) {
      this.store.setOutage(false);
    }
    this.trackSpend(usage);
  }

  recordFailure(error: unknown): void {
    if (!(error instanceof LlmError) || error.kind !== "insufficient_credits" || this.isOutage()) {
      return;
    }

    this.store.setOutage(true);
    this.lastProbeAt = this.now();
    void this.notifier.broadcast(OUTAGE_USER_TEXT);
    void this.notifier.notifyAdmins("The LLM provider is out of credits. Top up the account; the assistant recovers on its own.");
  }

  private trackSpend(usage: LlmUsage): void {
    const { prices } = this.config;
    const state = this.store.get();
    if (!prices || state.balanceUsd === null) {
      return;
    }

    this.store.deduct((usage.inputTokens * prices.inputPerMtok + usage.outputTokens * prices.outputPerMtok) / 1_000_000);
    const balance = this.store.get().balanceUsd ?? 0;

    if (balance >= this.config.lowBalanceUsd) {
      if (state.lowNotified) {
        this.store.setLowNotified(false);
      }

      return;
    }
    if (!state.lowNotified) {
      this.store.setLowNotified(true);
      void this.notifier.notifyAdmins(
        `Low LLM balance: about $${balance.toFixed(2)} left (warning threshold $${this.config.lowBalanceUsd}).`,
      );
    }
  }
}

