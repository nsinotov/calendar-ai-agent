import { google } from "googleapis";
import type { Logger } from "../logging/index.js";
import { GoogleCalendarProvider } from "./google-provider.js";
import { LoggingCalendarProvider } from "./logging-provider.js";
import type { CalendarProvider } from "./types.js";

export type { CalendarProvider, CalendarEvent, EventInput, EventTime, ListEventsOptions } from "./types.js";
export { CalendarError } from "./errors.js";

// `provider` is the identifier stored per user; the factory below decides what it means.
export interface CalendarConfig {
  provider: string;
  // The user's decrypted credentials for that provider.
  credentials: Record<string, string>;
  // Shared app-level settings per provider, e.g. the Google OAuth client.
  appCredentials: Record<string, Record<string, string>>;
}

export interface CredentialField {
  key: string;
  prompt: string;
  default?: string;
}

// What `pnpm add-user` asks for per provider; a new provider adds an entry here and a case below.
export const calendarCredentialFields: Record<string, CredentialField[]> = {
  google: [
    { key: "refreshToken", prompt: "Google refresh token" },
    { key: "calendarId", prompt: "Google calendar ID", default: "primary" },
  ],
};

export function createCalendarProvider(config: CalendarConfig, logger: Logger): CalendarProvider {
  return new LoggingCalendarProvider(createRawProvider(config), logger);
}

function createRawProvider(config: CalendarConfig): CalendarProvider {
  switch (config.provider) {
    case "google": {
      const app = requireFields("google app", config.appCredentials.google, ["clientId", "clientSecret"]);
      const user = requireFields("google user", config.credentials, ["refreshToken", "calendarId"]);
      const auth = new google.auth.OAuth2(app.clientId, app.clientSecret);
      auth.setCredentials({ refresh_token: user.refreshToken });

      const client = google.calendar({ version: "v3", auth });

      return new GoogleCalendarProvider(client, user.calendarId);
    }
    default:
      throw new Error(`Unknown calendar provider: "${config.provider}"`);
  }
}

function requireFields(label: string, source: Record<string, string> | undefined, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = source?.[key];
    if (!value) {
      throw new Error(`Missing calendar credential "${key}" (${label})`);
    }
    result[key] = value;
  }

  return result;
}

