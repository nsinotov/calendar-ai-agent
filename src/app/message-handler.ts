import { joinText, type Agent, type AgentContext } from "../agent/index.js";
import { OUTAGE_USER_TEXT, type BillingService } from "../billing/billing-service.js";
import { LlmError } from "../llm/errors.js";
import type { LlmProvider } from "../llm/types.js";
import type { ConversationStore } from "../memory/conversation-store.js";
import type { UserStore } from "../memory/user-store.js";
import type { MessageHandler, MessagingProvider } from "../messaging/index.js";
import type { AccessControl } from "./access-control.js";

const NOT_REGISTERED = "Sorry, you are not registered to use this assistant. Please contact the administrator.";
const HISTORY_CLEARED = "Conversation history cleared.";
const FAILED = "Something went wrong. Please try again later.";

const CLEAR_COMMAND = /^\/clear(@\w+)?$/i;
const BALANCE_COMMAND = /^\/balance(@\w+)?$/i;
const SET_BALANCE_COMMAND = /^\/setbalance(@\w+)?(?:\s+(.*))?$/i;
const AMOUNT = /^\d+(\.\d+)?$/;
const TRACKING_OFF = "Balance tracking is off (set LLM_BUDGET_USD and the token prices to enable it).";
const SET_BALANCE_USAGE = "Usage: /setbalance <usd>, e.g. /setbalance 20";

export interface MessageHandlerDeps {
  messaging: MessagingProvider;
  access: AccessControl;
  conversations: ConversationStore;
  users: UserStore;
  billing: BillingService;
  agent: Agent;
  llm: LlmProvider;
  languageOf: (userId: number) => string;
  buildContext: (userId: number) => AgentContext;
}

// Access control and commands are handled in code, without the agent.
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

    const command = text.trim();
    if (BALANCE_COMMAND.test(command) && deps.users.get(userId)?.role === "admin") {
      await deps.messaging.send(userId, balanceText(deps.billing.balanceUsd()));

      return;
    }
    const setBalance = SET_BALANCE_COMMAND.exec(command);
    if (setBalance && deps.users.get(userId)?.role === "admin") {
      await deps.messaging.send(userId, setBalanceReply(deps.billing, setBalance[2]?.trim() ?? ""));

      return;
    }
    if (CLEAR_COMMAND.test(command)) {
      deps.conversations.clear(userId);
      const translated = deps.billing.isOutage() ? HISTORY_CLEARED : await translate(deps.llm, deps.languageOf(userId), HISTORY_CLEARED);
      await deps.messaging.send(userId, translated);

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

function setBalanceReply(billing: BillingService, amount: string): string {
  if (!AMOUNT.test(amount)) {
    return SET_BALANCE_USAGE;
  }

  billing.setBalance(Number(amount));
  const balance = billing.balanceUsd();

  return balance === null ? TRACKING_OFF : `LLM balance set to $${balance.toFixed(2)}.`;
}

function balanceText(balanceUsd: number | null): string {
  return balanceUsd === null
    ? TRACKING_OFF
    : `Estimated LLM balance: $${balanceUsd.toFixed(2)} (tracked locally from token usage).`;
}

// Falls back to the English text when the LLM is unavailable, so /clear always works.
async function translate(llm: LlmProvider, language: string, text: string): Promise<string> {
  try {
    const response = await llm.complete({
      system: `Translate the user's message into the language with code "${language}". Reply with the translation only.`,
      messages: [{ role: "user", content: text }],
      tools: [],
    });

    return joinText(response.content) || text;
  } catch {
    return text;
  }
}

