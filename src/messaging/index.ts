import { Bot } from "grammy";
import type { Logger } from "../logging/index.js";
import { LoggingMessagingProvider } from "./logging-provider.js";
import { TelegramMessagingProvider } from "./telegram-provider.js";
import type { MessagingProvider } from "./types.js";

export type { IncomingMessage, MessageHandler, MessagingProvider } from "./types.js";

// `provider` is the identifier from env; the factory below decides what it means.
export interface MessagingConfig {
  provider: string;
  botToken?: string;
  webhook?: { url: string; secret: string; port: number };
}

export function createMessagingProvider(config: MessagingConfig, logger: Logger): MessagingProvider {
  return new LoggingMessagingProvider(createRawProvider(config), logger);
}

function createRawProvider(config: MessagingConfig): MessagingProvider {
  switch (config.provider) {
    case "telegram": {
      if (!config.botToken) {
        throw new Error("Telegram provider requires a bot token");
      }

      return new TelegramMessagingProvider(new Bot(config.botToken), config.webhook);
    }
    default:
      throw new Error(`Unknown messaging provider: "${config.provider}"`);
  }
}

