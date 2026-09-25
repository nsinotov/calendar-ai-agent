import type { LogEntry, LogProvider } from "./types.js";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

interface AlertState {
  lastSentAt: number;
  suppressed: number;
}

// Turns error-level log entries into short alert texts for admins. Repeats of the
// same event are sent at most once per window. The text carries only the event name and
// error kind, never message content or ids; details stay in the regular logs.
export class AlertLogProvider implements LogProvider {
  private send: ((text: string) => Promise<void>) | null = null;
  private sending = false;
  private readonly states = new Map<string, AlertState>();

  constructor(
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  // Alerts are dropped until a sink is connected (the sink needs components built after the logger).
  connect(send: (text: string) => Promise<void>): void {
    this.send = send;
  }

  write(entry: LogEntry): void {
    // While an alert is being sent, errors from sending it must not trigger another one.
    if (entry.level !== "error" || !this.send || this.sending) {
      return;
    }

    const kind = typeof entry.context?.kind === "string" ? entry.context.kind : null;
    const key = kind ? `${entry.message}:${kind}` : entry.message;
    const state = this.states.get(key);

    if (state && this.now() - state.lastSentAt < this.windowMs) {
      state.suppressed++;

      return;
    }

    const suppressed = state?.suppressed ?? 0;
    this.states.set(key, { lastSentAt: this.now(), suppressed: 0 });
    void this.deliver(alertText(entry.message, kind, suppressed));
  }

  private async deliver(text: string): Promise<void> {
    this.sending = true;
    try {
      await this.send?.(text);
    } catch {
      // Nothing left to report to: the failure is already in the regular logs.
    } finally {
      this.sending = false;
    }
  }
}

function alertText(event: string, kind: string | null, suppressed: number): string {
  const repeats = suppressed > 0 ? ` (${suppressed} similar errors since the last alert)` : "";

  return `System error: ${event}${kind ? ` [${kind}]` : ""}${repeats}. See the server logs.`;
}

