import { createCalendarProvider, type CalendarConfig, type CalendarProvider } from "../calendar/index.js";
import type { Logger } from "../logging/index.js";
import type { UserSettingsStore } from "../memory/user-settings-store.js";
import type { UserSecretsStore } from "../secrets/user-secrets-store.js";

// Builds the calendar provider a user has chosen and stored credentials for, or null when none.
export function createCalendarResolver(deps: {
  settings: UserSettingsStore;
  secrets: UserSecretsStore;
  appCredentials: CalendarConfig["appCredentials"];
  logger: Logger;
}): (userId: number) => CalendarProvider | null {
  return (userId) => {
    const provider = deps.settings.get(userId).calendarProvider;
    const credentials = provider ? deps.secrets.get(userId, "calendar", provider) : null;
    if (!provider || !credentials) {
      return null;
    }

    return createCalendarProvider({ provider, credentials, appCredentials: deps.appCredentials }, deps.logger);
  };
}

