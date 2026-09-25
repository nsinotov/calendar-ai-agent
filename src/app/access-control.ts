import type { UserStore } from "../memory/user-store.js";

export type AccessDecision = "allowed" | "rejected" | "ignored";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REMEMBERED = 1000;

// Registered users pass. An unregistered sender is rejected once (the caller
// sends a static reply, no LLM), then ignored until the memory of them expires.
export class AccessControl {
  private readonly rejected = new Map<number, number>();

  constructor(
    private readonly users: UserStore,
    private readonly rememberMs = DAY_MS,
    private readonly now: () => number = Date.now,
  ) {}

  check(userId: number): AccessDecision {
    if (this.users.get(userId)) {
      return "allowed";
    }

    const rejectedAt = this.rejected.get(userId);
    if (rejectedAt !== undefined && this.now() - rejectedAt < this.rememberMs) {
      return "ignored";
    }

    this.remember(userId);

    return "rejected";
  }

  // Map keeps insertion order, so the oldest entry is evicted first.
  private remember(userId: number): void {
    this.rejected.delete(userId);
    if (this.rejected.size >= MAX_REMEMBERED) {
      const oldest = this.rejected.keys().next().value;
      if (oldest !== undefined) {
        this.rejected.delete(oldest);
      }
    }
    this.rejected.set(userId, this.now());
  }
}

