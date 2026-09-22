import type { LogEntry, LogProvider } from "./types.js";

export class ConsoleLogProvider implements LogProvider {
  write(entry: LogEntry): void {
    const line = `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}`;
    const print = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.log;
    if (entry.context) {
      print(line, entry.context);
    } else {
      print(line);
    }
  }
}

