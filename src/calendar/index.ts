import { google } from "googleapis";
import type { Logger } from "../logging/index.js";
import { GoogleCalendarProvider } from "./google-provider.js";
import { LoggingCalendarProvider } from "./logging-provider.js";
import type { CalendarProvider } from "./types.js";

export type { CalendarProvider, CalendarEvent, EventInput, EventTime, ListEventsOptions } from "./types.js";
export { CalendarError } from "./errors.js";

// A union on `provider`: a new provider means one more member and one more case.
export type CalendarConfig = {
  provider: "google";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

export function createCalendarProvider(config: CalendarConfig, logger: Logger): CalendarProvider {
  return new LoggingCalendarProvider(createRawProvider(config), logger);
}

function createRawProvider(config: CalendarConfig): CalendarProvider {
  switch (config.provider) {
    case "google": {
      const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
      auth.setCredentials({ refresh_token: config.refreshToken });

      const client = google.calendar({ version: "v3", auth });

      return new GoogleCalendarProvider(client, config.calendarId);
    }
    default:
      throw new Error(`Unknown calendar provider: "${(config as { provider: string }).provider}"`);
  }
}

