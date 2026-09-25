import { joinText, type Agent, type AgentContext } from "../agent/index.js";
import type { LlmProvider } from "../llm/types.js";
import type { ConversationStore } from "../memory/conversation-store.js";
import type { MessageHandler, MessagingProvider } from "../messaging/index.js";
import type { AccessControl } from "./access-control.js";

const NOT_REGISTERED = "Sorry, you are not registered to use this assistant. Please contact the administrator.";
const HISTORY_CLEARED = "Conversation history cleared.";
const FAILED = "Something went wrong. Please try again later.";

const CLEAR_COMMAND = /^\/clear(@\w+)?$/i;

export interface MessageHandlerDeps {
  messaging: MessagingProvider;
  access: AccessControl;
  conversations: ConversationStore;
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

    if (CLEAR_COMMAND.test(text.trim())) {
      deps.conversations.clear(userId);
      await deps.messaging.send(userId, await translate(deps.llm, deps.languageOf(userId), HISTORY_CLEARED));

      return;
    }

    try {
      const reply = await deps.agent.reply(userId, text, deps.buildContext(userId));
      await deps.messaging.send(userId, reply);
    } catch (error) {
      await deps.messaging.send(userId, FAILED);
      throw error;
    }
  };
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

