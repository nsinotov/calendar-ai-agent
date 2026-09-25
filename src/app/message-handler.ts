import type { Agent, AgentContext } from "../agent/index.js";
import { OUTAGE_USER_TEXT, type BillingService } from "../billing/billing-service.js";
import { LlmError } from "../llm/errors.js";
import type { UserStore } from "../memory/user-store.js";
import type { MessageHandler, MessagingProvider } from "../messaging/index.js";
import type { AccessControl } from "./access-control.js";
import { canUse, parseCommand, type Command } from "./commands.js";

const NOT_REGISTERED = "Sorry, you are not registered to use this assistant. Please contact the administrator.";
const FAILED = "Something went wrong. Please try again later.";

export interface MessageHandlerDeps {
  messaging: MessagingProvider;
  access: AccessControl;
  users: UserStore;
  billing: BillingService;
  commands: Command[];
  agent: Agent;
  buildContext: (userId: number) => AgentContext;
}

// Access control and known commands are handled in code, without the agent; other text goes to the agent.
export function createMessageHandler(deps: MessageHandlerDeps): MessageHandler {
  return async ({ userId, text }) => {
    const decision = deps.access.check(userId);
    if (decision === "ignored") {
      return;
    }
    if (decision === "rejected") {
      await deps.messaging.send(userId, NOT_REGISTERED);

      return;
    }

    const parsed = parseCommand(text);
    const role = deps.users.get(userId)?.role;
    const command = parsed && role && deps.commands.find((candidate) => candidate.name === parsed.name && canUse(role, candidate));
    if (command && parsed) {
      await deps.messaging.send(userId, await command.run(userId, parsed.args));

      return;
    }

    if (deps.billing.blocksRequests()) {
      await deps.messaging.send(userId, OUTAGE_USER_TEXT);

      return;
    }

    try {
      const reply = await deps.agent.reply(userId, text, deps.buildContext(userId));
      await deps.messaging.send(userId, reply);
    } catch (error) {
      if (error instanceof LlmError && error.kind === "insufficient_credits") {
        await deps.messaging.send(userId, OUTAGE_USER_TEXT);

        return;
      }
      await deps.messaging.send(userId, FAILED);
      throw error;
    }
  };
}

