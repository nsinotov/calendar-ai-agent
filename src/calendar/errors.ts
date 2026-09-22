export type CalendarErrorKind = "auth" | "not_found" | "rate_limit" | "unavailable" | "unknown";

// Every provider maps its own errors to this, so the rest of the app
// never depends on a specific calendar SDK.
export class CalendarError extends Error {
  constructor(
    readonly kind: CalendarErrorKind,
    message: string,
    options?: { cause: unknown },
  ) {
    super(message, options);
    this.name = "CalendarError";
  }
}

