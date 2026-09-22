import type { LogEntry, LogLevel, LogProvider, Logger } from "./types.js";

export interface CompositeLoggerOptions {
  providers: LogProvider[];
  // Which of error/warn/info are active; any combination.
  levels: ReadonlySet<"error" | "warn" | "info">;
  debugEnabled: boolean;
}

export class CompositeLogger implements Logger {
  constructor(private readonly options: CompositeLoggerOptions) {}

  error(message: string, context?: Record<string, unknown>): void {
    if (this.options.levels.has("error")) this.dispatch("error", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.options.levels.has("warn")) this.dispatch("warn", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.options.levels.has("info")) this.dispatch("info", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.options.debugEnabled) this.dispatch("debug", message, context);
  }

  private dispatch(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, ...(context && { context }) };
    for (const provider of this.options.providers) {
      try {
        provider.write(entry);
      } catch (error) {
        // A logging provider must never take the app down with it.
        console.error("Log provider failed", error);
      }
    }
  }
}

