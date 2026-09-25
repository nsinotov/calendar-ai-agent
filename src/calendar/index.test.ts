import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "../logging/index.js";
import { createCalendarProvider } from "./index.js";

const logger: Logger = { error() {}, warn() {}, info() {}, debug() {} };

test("an unknown provider identifier throws", () => {
  assert.throws(
    () => createCalendarProvider({ provider: "nope", credentials: {}, appCredentials: {} }, logger),
    /Unknown calendar provider: "nope"/,
  );
});

test("google without the user's credentials throws", () => {
  assert.throws(
    () =>
      createCalendarProvider(
        { provider: "google", credentials: {}, appCredentials: { google: { clientId: "id", clientSecret: "secret" } } },
        logger,
      ),
    /refreshToken/,
  );
});

test("google without the app's OAuth client throws", () => {
  assert.throws(
    () =>
      createCalendarProvider(
        { provider: "google", credentials: { refreshToken: "t", calendarId: "primary" }, appCredentials: {} },
        logger,
      ),
    /clientId/,
  );
});

test("google with complete credentials creates a provider", () => {
  const provider = createCalendarProvider(
    {
      provider: "google",
      credentials: { refreshToken: "t", calendarId: "primary" },
      appCredentials: { google: { clientId: "id", clientSecret: "secret" } },
    },
    logger,
  );

  assert.equal(typeof provider.listEvents, "function");
});

