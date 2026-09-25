import { createServer, type Server } from "node:http";
import { Bot, webhookCallback } from "grammy";
import type { MessageHandler, MessagingProvider } from "./types.js";
import { splitMessage } from "./split-message.js";

const TELEGRAM_MESSAGE_LIMIT = 4096;

export interface TelegramWebhookOptions {
  url: string;
  secret: string;
  port: number;
}

// Long polling when no webhook is given (dev), otherwise a webhook server (prod).
// Only private chats are handled; replies go to the sender's private chat.
export class TelegramMessagingProvider implements MessagingProvider {
  private server: Server | null = null;

  constructor(
    private readonly bot: Bot,
    private readonly webhook?: TelegramWebhookOptions,
  ) {}

  onMessage(handler: MessageHandler): void {
    this.bot.chatType("private").on("message:text", (ctx) => handler({ userId: ctx.from.id, text: ctx.message.text }));
  }

  async send(userId: number, text: string): Promise<void> {
    for (const chunk of splitMessage(text, TELEGRAM_MESSAGE_LIMIT)) {
      await this.bot.api.sendMessage(userId, chunk);
    }
  }

  async start(): Promise<void> {
    if (this.webhook) {
      await this.startWebhook(this.webhook);

      return;
    }
    await this.bot.api.deleteWebhook();
    void this.bot.start();
  }

  async stop(): Promise<void> {
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));

      return;
    }
    await this.bot.stop();
  }

  private async startWebhook(webhook: TelegramWebhookOptions): Promise<void> {
    const path = new URL(webhook.url).pathname;
    const handle = webhookCallback(this.bot, "http", { secretToken: webhook.secret });

    await this.bot.api.setWebhook(webhook.url, { secret_token: webhook.secret });
    this.server = createServer((request, response) => {
      if (request.method !== "POST" || request.url !== path) {
        response.writeHead(404).end();

        return;
      }
      void handle(request, response);
    });
    await new Promise<void>((resolve) => this.server?.listen(webhook.port, resolve));
  }
}

