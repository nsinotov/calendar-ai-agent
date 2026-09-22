import type { Logger } from "../logging/index.js";
import { LlmError } from "./errors.js";
import type { LlmProvider, LlmRequest, LlmResponse, ToolCallBlock } from "./types.js";

// Wraps any LlmProvider with logging. Request/response metadata goes to
// info; the raw content (may hold personal data) goes to debug only.
export class LoggingLlmProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    private readonly logger: Logger,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.logger.debug("llm.request", {
      messages: request.messages,
      tools: request.tools.map((tool) => tool.name),
    });

    const startedAt = Date.now();
    try {
      const response = await this.inner.complete(request);
      const toolCalls = response.content.filter(
        (block): block is ToolCallBlock => block.type === "tool_call",
      );
      this.logger.info("llm.response", {
        stopReason: response.stopReason,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        toolCalls: toolCalls.map((call) => call.name),
        durationMs: Date.now() - startedAt,
      });
      this.logger.debug("llm.response.detail", { content: response.content });

      return response;
    } catch (error) {
      this.logger.error("llm.error", {
        kind: error instanceof LlmError ? error.kind : "unknown",
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}

