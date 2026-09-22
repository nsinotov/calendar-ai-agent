export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogProvider {
  write(entry: LogEntry): void;
}

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  // Verbose, may contain personal data (message text, tool inputs). Gated by DEBUG_ENABLED.
  debug(message: string, context?: Record<string, unknown>): void;
}

