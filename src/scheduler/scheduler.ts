import type { CalendarProvider } from "../calendar/index.js";
import type { Logger } from "../logging/index.js";
import type { UserSettingsStore } from "../memory/user-settings-store.js";
import type { UserStore } from "../memory/user-store.js";
import type { Job } from "./types.js";

export interface SchedulerDeps {
  users: UserStore;
  settings: UserSettingsStore;
  resolveCalendar: (userId: number) => CalendarProvider | null;
  jobs: Job[];
  logger: Logger;
  now?: () => Date;
}

// Ticks on a fixed interval; each tick runs every job for every user that has a calendar.
// One failing user or job is logged and never stops the others.
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly deps: SchedulerDeps,
    readonly tickMs: number,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const now = (this.deps.now ?? (() => new Date()))();
      for (const { id: userId } of this.deps.users.list()) {
        await this.runUser(userId, now);
      }
    } finally {
      this.running = false;
    }
  }

  private async runUser(userId: number, now: Date): Promise<void> {
    let context;
    try {
      const calendar = this.deps.resolveCalendar(userId);
      if (!calendar) {
        return;
      }
      context = { userId, settings: this.deps.settings.get(userId), calendar, now };
    } catch (error) {
      this.logJobError("setup", error);

      return;
    }

    for (const job of this.deps.jobs) {
      try {
        await job.run(context);
      } catch (error) {
        this.logJobError(job.name, error);
      }
    }
  }

  private logJobError(job: string, error: unknown): void {
    this.deps.logger.error("scheduler.job", { kind: job, message: error instanceof Error ? error.message : String(error) });
  }
}

