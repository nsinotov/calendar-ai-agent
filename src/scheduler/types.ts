import type { CalendarProvider } from "../calendar/index.js";
import type { UserSettings } from "../memory/user-settings-store.js";

export interface JobContext {
  userId: number;
  settings: UserSettings;
  calendar: CalendarProvider;
  now: Date;
}

// Runs for every user with a calendar on every tick and decides itself whether anything is due.
export interface Job {
  name: string;
  run(context: JobContext): Promise<void>;
}

export type SendMessage = (userId: number, text: string) => Promise<void>;

