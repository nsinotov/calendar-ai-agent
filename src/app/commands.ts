import { joinText, type CommandInfo } from "../agent/index.js";
import { type BillingService } from "../billing/billing-service.js";
import type { LlmProvider } from "../llm/types.js";
import type { ConversationStore } from "../memory/conversation-store.js";
import type { UserRole } from "../memory/user-store.js";

export interface Command extends CommandInfo {
  name: string;
  // The lowest role allowed to use it; admins can use everything.
  role: UserRole;
  // Returns the reply text.
  run(userId: number, args: string): Promise<string>;
}

export interface CommandDeps {
  conversations: ConversationStore;
  billing: BillingService;
  llm: LlmProvider;
  languageOf: (userId: number) => string;
}

const HISTORY_CLEARED = "Conversation history cleared.";
const TRACKING_OFF = "Balance tracking is off (set LLM_BUDGET_USD and the token prices to enable it).";
const AMOUNT = /^\d+(\.\d+)?$/;

// The one place commands are defined: the message handler runs them and the capabilities tool describes them.
export function createCommands(deps: CommandDeps): Command[] {
  return [
    {
      name: "clear",
      usage: "/clear",
      description: "Clear the conversation history. Notes and settings stay.",
      role: "user",
      async run(userId) {
        deps.conversations.clear(userId);

        return deps.billing.isOutage() ? HISTORY_CLEARED : translate(deps.llm, deps.languageOf(userId), HISTORY_CLEARED);
      },
    },
    {
      name: "balance",
      usage: "/balance",
      description: "Show the tracked LLM balance.",
      role: "admin",
      async run() {
        const balance = deps.billing.balanceUsd();

        return balance === null
          ? TRACKING_OFF
          : `Estimated LLM balance: $${balance.toFixed(2)} (tracked locally from token usage).`;
      },
    },
    {
      name: "setbalance",
      usage: "/setbalance <usd>",
      description: "Set the tracked LLM balance after a top-up, e.g. /setbalance 20.",
      role: "admin",
      async run(_userId, args) {
        if (!AMOUNT.test(args)) {
          return "Usage: /setbalance <usd>, e.g. /setbalance 20";
        }

        deps.billing.setBalance(Number(args));
        const balance = deps.billing.balanceUsd();

        return balance === null ? TRACKING_OFF : `LLM balance set to $${balance.toFixed(2)}.`;
      },
    },
  ];
}

export function canUse(role: UserRole, command: Command): boolean {
  return command.role === "user" || role === "admin";
}

// "/setbalance@my_bot 20" -> { name: "setbalance", args: "20" }; null for non-commands.
export function parseCommand(text: string): { name: string; args: string } | null {
  const match = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());

  return match ? { name: match[1]!.toLowerCase(), args: match[2]?.trim() ?? "" } : null;
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

