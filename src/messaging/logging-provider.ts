import type { Logger } from "../logging/index.js";
import type { MessageHandler, MessagingProvider } from "./types.js";

// Wraps any MessagingProvider with logging. Info logs stay metadata-only
// (user id, text length); message text (personal data) goes to debug only.
export class LoggingMessagingProvider implements MessagingProvider {
  constructor(
    private readonly inner: MessagingProvider,
    private readonly logger: Logger,
  ) {}

  // A failing handler is logged and swallowed so one bad message cannot stop the provider.
  onMessage(handler: MessageHandler): void {
    this.inner.onMessage(async (message) => {
      this.logger.info("messaging.received", { userId: message.userId, length: message.text.length });
      this.logger.debug("messaging.received.text", { userId: message.userId, text: message.text });

      try {
        await handler(message);
      } catch (error) {
        this.logger.error("messaging.handler", {
          userId: message.userId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  async send(userId: number, text: string): Promise<void> {
    this.logger.debug("messaging.send.text", { userId, text });

    return this.run("messaging.send", () => this.inner.send(userId, text), { userId, length: text.length });
  }

  start(): Promise<void> {
    return this.run("messaging.start", () => this.inner.start(), {});
  }

  stop(): Promise<void> {
    return this.run("messaging.stop", () => this.inner.stop(), {});
  }

  private async run(label: string, action: () => Promise<void>, context: Record<string, unknown>): Promise<void> {
    try {
      await action();
      this.logger.info(label, context);
    } catch (error) {
      this.logger.error(label, { ...context, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

