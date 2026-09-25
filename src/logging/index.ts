import { ConsoleLogProvider } from "./console-provider.js";
import { FileLogProvider } from "./file-provider.js";
import { CompositeLogger } from "./logger.js";
import type { LogProvider } from "./types.js";

export type { Logger, LogLevel, LogEntry, LogProvider } from "./types.js";

export interface LoggingConfig {
  providers: string[];
  levels: ("error" | "warn" | "info")[];
  debugEnabled: boolean;
  // Exact directory the file provider writes into (caller resolves any default).
  dir: string;
  retentionDays: number;
}

export function createLogger(config: LoggingConfig): CompositeLogger {
  const providers: LogProvider[] = config.providers.map((name) => {
    switch (name) {
      case "console":
        return new ConsoleLogProvider();
      case "file":
        return new FileLogProvider(config.dir, config.retentionDays);
      default:
        throw new Error(`Unknown log provider: "${name}"`);
    }
  });

  return new CompositeLogger({
    providers,
    levels: new Set(config.levels),
    debugEnabled: config.debugEnabled,
  });
}

