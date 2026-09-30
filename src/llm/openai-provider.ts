import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions/completions";
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

export interface OpenAiProviderOptions {
  model: string;
  maxTokens: number;
}

export class OpenAiProvider implements LlmProvider {
  constructor(
    private readonly client: OpenAI,
    private readonly options: OpenAiProviderOptions,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        max_completion_tokens: this.options.maxTokens,
        messages: [
          { role: "system", content: request.system },
          ...request.messages.flatMap(toOpenAiMessages),
        ],
        tools: request.tools.length ? request.tools.map(toOpenAiTool) : undefined,
      });
      return fromOpenAiResponse(response);
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

// One neutral message can become several OpenAI messages: a tool_result block
// is its own "tool" role message, not a field on the user message.
function toOpenAiMessages(message: Message): ChatCompletionMessageParam[] {
  if (typeof message.content === "string") {
    return [{ role: message.role, content: message.content }];
  }

  if (message.role === "user") {
    const results = message.content.filter(
      (block): block is Extract<ContentBlock, { type: "tool_result" }> =>
        block.type === "tool_result",
    );
    if (results.length) {
      return results.map((block) => ({
        role: "tool",
        tool_call_id: block.callId,
        content: block.isError ? `Error: ${block.content}` : block.content,
      }));
    }
    const text = message.content
      .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return [{ role: "user", content: text }];
  }

  const text = message.content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const toolCalls = message.content.filter(
    (block): block is Extract<ContentBlock, { type: "tool_call" }> => block.type === "tool_call",
  );

  return [
    {
      role: "assistant",
      content: text || (toolCalls.length ? null : ""),
      tool_calls: toolCalls.length
        ? toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          }))
        : undefined,
    },
  ];
}

function toOpenAiTool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function fromOpenAiResponse(response: OpenAI.ChatCompletion): LlmResponse {
  const choice = response.choices[0];
  if (!choice) {
    throw new LlmError("unknown", "OpenAI response had no choices");
  }

  const content: LlmResponse["content"] = [];
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  for (const call of choice.message.tool_calls ?? []) {
    if (call.type !== "function") continue;
    content.push({
      type: "tool_call",
      id: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    });
  }

  const usage = response.usage;

  return {
    content,
    stopReason: toStopReason(choice.finish_reason),
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);

    return isRecord(parsed) ? parsed : {};
  } catch {
    // The model does not always emit valid JSON; an empty call is safer than throwing.
    return {};
  }
}

function toStopReason(reason: OpenAI.ChatCompletion.Choice["finish_reason"]): StopReason {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "end_turn";
  }
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof OpenAI.RateLimitError) {
    // OpenAI reuses HTTP 429 for both rate limiting and an empty/expired quota.
    if (error.code === "insufficient_quota") {
      return new LlmError("insufficient_credits", error.message, { cause: error });
    }

    return new LlmError("rate_limit", error.message, { cause: error });
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new LlmError("auth", error.message, { cause: error });
  }
  if (error instanceof OpenAI.InternalServerError || error instanceof OpenAI.APIConnectionError) {
    return new LlmError("unavailable", error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);

  return new LlmError("unknown", message, { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

