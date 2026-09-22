import Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "./errors.js";
import type {
  ContentBlock,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  Message,
  StopReason,
  ToolDefinition,
} from "./types.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicProviderOptions {
  model: string;
  maxTokens: number;
  effort?: Effort;
}

export class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly options: AnthropicProviderOptions,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        // Thinking blocks would have to be stored and replayed in tool loops,
        // which the neutral message format does not carry. Keep it off.
        thinking: { type: "disabled" },
        ...(this.options.effort && { output_config: { effort: this.options.effort } }),
        // Caches the stable prefix (tools + system prompt) between requests.
        cache_control: { type: "ephemeral" },
        system: request.system,
        messages: request.messages.map(toAnthropicMessage),
        tools: request.tools.map(toAnthropicTool),
      });
      return fromAnthropicResponse(response);
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

function toAnthropicMessage(message: Message): Anthropic.MessageParam {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }

  return { role: message.role, content: message.content.map(toAnthropicBlock) };
}

function toAnthropicBlock(block: ContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_call":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.callId,
        content: block.content,
        is_error: block.isError ?? false,
      };
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

function fromAnthropicResponse(response: Anthropic.Message): LlmResponse {
  const content: LlmResponse["content"] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      content.push({
        type: "tool_call",
        id: block.id,
        name: block.name,
        input: isRecord(block.input) ? block.input : {},
      });
    }
  }

  const { usage } = response;

  return {
    content,
    stopReason: toStopReason(response.stop_reason),
    usage: {
      // Cached tokens are billed at different rates; counting them at the full
      // rate slightly overestimates spend, which is the safe side for a budget.
      inputTokens:
        usage.input_tokens +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
    },
  };
}

function toStopReason(reason: Anthropic.Message["stop_reason"]): StopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "end_turn";
  }
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof Anthropic.BadRequestError) {
    // The API has no dedicated error code for an empty balance, only this message.
    if (/credit balance is too low/i.test(error.message)) {
      return new LlmError("insufficient_credits", error.message, { cause: error });
    }
  } else if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError("auth", error.message, { cause: error });
  } else if (error instanceof Anthropic.RateLimitError) {
    return new LlmError("rate_limit", error.message, { cause: error });
  } else if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return new LlmError("unavailable", error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);

  return new LlmError("unknown", message, { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

