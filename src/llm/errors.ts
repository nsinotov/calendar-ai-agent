export type LlmErrorKind =
  | "insufficient_credits"
  | "auth"
  | "rate_limit"
  | "unavailable"
  | "unknown";

// Every provider maps its own errors to this, so the rest of the app
// (e.g. billing warnings) never depends on a specific SDK.
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options?: { cause: unknown },
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}

