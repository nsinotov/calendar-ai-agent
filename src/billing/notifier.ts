import type { Logger } from "../logging/index.js";
import type { UserStore } from "../memory/user-store.js";
import type { MessagingProvider } from "../messaging/index.js";
import type { Notifier } from "./billing-service.js";

export function createMessagingNotifier(messaging: MessagingProvider, users: UserStore, logger: Logger): Notifier {
  async function sendAll(recipients: { id: number }[], text: string): Promise<void> {
    for (const { id } of recipients) {
      try {
        await messaging.send(id, text);
      } catch (error) {
        logger.warn("notifier.send", { userId: id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    notifyAdmins: (text) => sendAll(users.listAdmins(), text),
    broadcast: (text) => sendAll(users.list(), text),
  };
}

