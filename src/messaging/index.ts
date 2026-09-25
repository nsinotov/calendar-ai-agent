import { Bot } from "grammy";
import type { Logger } from "../logging/index.js";
import { LoggingMessagingProvider } from "./logging-provider.js";
import { TelegramMessagingProvider } from "./telegram-provider.js";
import type { MessagingProvider } from "./types.js";

export type { IncomingMessage, MessageHandler, MessagingProvider } from "./types.js";

// A union on `provider`: a new provider means one more member and one more case.
export type MessagingConfig = {
  provider: "telegram";
  botToken: string;
  webhook?: { url: string; secret: string; port: number };
};

export function createMessagingProvider(config: MessagingConfig, logger: Logger): MessagingProvider {
  return new LoggingMessagingProvider(createRawProvider(config), logger);
}

function createRawProvider(config: MessagingConfig): MessagingProvider {
  switch (config.provider) {
    case "telegram":
      return new TelegramMessagingProvider(new Bot(config.botToken), config.webhook);
    default:
      throw new Error(`Unknown messaging provider: "${(config as { provider: string }).provider}"`);
  }
}

