import type { ContentBlock, LlmProvider, Message, ToolCallBlock, ToolResultBlock } from "../llm/types.js";
import type { ConversationStore } from "../memory/conversation-store.js";
import type { Tool } from "./tool.js";

const DEFAULT_MAX_STEPS = 10;

export interface AgentContext {
  system: string;
  tools: Tool[];
  retentionDays: number;
  toolResultRetentionMinutes: number;
}

export class Agent {
  constructor(
    private readonly llm: LlmProvider,
    private readonly conversations: ConversationStore,
    private readonly maxSteps = DEFAULT_MAX_STEPS,
  ) {}

  async reply(userId: number, text: string, context: AgentContext): Promise<string> {
    const userMessage: Message = { role: "user", content: text };
    this.conversations.append(userId, userMessage);
    const messages = this.conversations.load(userId, context.retentionDays, context.toolResultRetentionMinutes);
    const toolsByName = new Map(context.tools.map((tool) => [tool.definition.name, tool]));

    for (let step = 0; step < this.maxSteps; step++) {
      const response = await this.llm.complete({
        system: context.system,
        messages,
        tools: context.tools.map((tool) => tool.definition),
      });
      this.record(userId, messages, { role: "assistant", content: response.content });

      const calls = response.content.filter((block): block is ToolCallBlock => block.type === "tool_call");
      if (response.stopReason !== "tool_use" || calls.length === 0) {
        return joinText(response.content);
      }

      const results = await Promise.all(calls.map((call) => runTool(toolsByName, call)));
      this.record(userId, messages, { role: "user", content: results });
    }

    throw new Error(`Agent did not finish within ${this.maxSteps} steps`);
  }

  private record(userId: number, messages: Message[], message: Message): void {
    messages.push(message);
    this.conversations.append(userId, message);
  }
}

async function runTool(tools: Map<string, Tool>, call: ToolCallBlock): Promise<ToolResultBlock> {
  const tool = tools.get(call.name);
  if (!tool) {
    return { type: "tool_result", callId: call.id, content: `Unknown tool: ${call.name}`, isError: true };
  }

  try {
    return { type: "tool_result", callId: call.id, content: await tool.execute(call.input) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { type: "tool_result", callId: call.id, content: message, isError: true };
  }
}

function joinText(content: ContentBlock[]): string {
  return content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
}

