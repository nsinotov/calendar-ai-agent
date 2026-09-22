import type { Logger } from "../logging/index.js";
import { CalendarError } from "./errors.js";
import type { CalendarEvent, CalendarProvider, EventInput, ListEventsOptions } from "./types.js";

// Wraps any CalendarProvider with logging. Info logs stay metadata-only
// (ids, counts); event titles/descriptions (personal data) go to debug only.
export class LoggingCalendarProvider implements CalendarProvider {
  constructor(
    private readonly inner: CalendarProvider,
    private readonly logger: Logger,
  ) {}

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    this.logger.debug("calendar.listEvents.request", { options });

    return this.run("calendar.listEvents", () => this.inner.listEvents(options), (events) => ({
      count: events.length,
    }));
  }

  async createEvent(input: EventInput): Promise<CalendarEvent> {
    this.logger.debug("calendar.createEvent.request", { input });

    return this.run("calendar.createEvent", () => this.inner.createEvent(input), (event) => ({
      id: event.id,
    }));
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent> {
    this.logger.debug("calendar.updateEvent.request", { id, input });

    return this.run("calendar.updateEvent", () => this.inner.updateEvent(id, input), (event) => ({
      id: event.id,
    }));
  }

  async deleteEvent(id: string): Promise<void> {
    this.logger.debug("calendar.deleteEvent.request", { id });

    return this.run("calendar.deleteEvent", () => this.inner.deleteEvent(id), () => ({ id }));
  }

  private async run<T>(
    label: string,
    action: () => Promise<T>,
    describe: (result: T) => Record<string, unknown>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      this.logger.info(label, { ...describe(result), durationMs: Date.now() - startedAt });

      return result;
    } catch (error) {
      this.logger.error(label, {
        kind: error instanceof CalendarError ? error.kind : "unknown",
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}

