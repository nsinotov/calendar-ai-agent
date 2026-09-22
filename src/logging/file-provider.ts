import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { LogEntry, LogProvider } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.log$/;

// One file per day (from the entry's own date, so it stays correct across
// TZ/DST); old files are swept away once retentionDays have passed.
export class FileLogProvider implements LogProvider {
  private lastCleanupDate: string | undefined;

  constructor(
    private readonly dir: string,
    private readonly retentionDays: number,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  write(entry: LogEntry): void {
    const date = entry.timestamp.slice(0, 10);
    appendFileSync(join(this.dir, `${date}.log`), `${JSON.stringify(entry)}\n`);

    if (date !== this.lastCleanupDate) {
      this.lastCleanupDate = date;
      this.cleanup();
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.retentionDays * DAY_MS;

    for (const name of readdirSync(this.dir)) {
      const match = LOG_FILE_NAME.exec(name);
      if (!match) continue;
      const fileDate = Date.parse(`${match[1]}T00:00:00Z`);
      if (fileDate < cutoff) {
        unlinkSync(join(this.dir, name));
      }
    }
  }
}

