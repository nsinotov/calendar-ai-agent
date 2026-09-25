import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Logger } from "../logging/index.js";
import { AnthropicProvider, type Effort } from "./anthropic-provider.js";
import { LoggingLlmProvider } from "./logging-provider.js";
import { OpenAiProvider } from "./openai-provider.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider } from "./types.js";
export { LlmError } from "./errors.js";

// `provider` is the identifier from env; the factory below decides what it means.
export interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  // Anthropic-only; other providers ignore it.
  effort?: Effort;
}

export function createLlmProvider(config: LlmConfig, logger: Logger): LlmProvider {
  return new LoggingLlmProvider(createRawProvider(config), logger);
}

function createRawProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(new Anthropic({ apiKey: config.apiKey }), {
        model: config.model,
        maxTokens: config.maxTokens,
        effort: config.effort,
      });
    case "openai":
      return new OpenAiProvider(new OpenAI({ apiKey: config.apiKey }), {
        model: config.model,
        maxTokens: config.maxTokens,
      });
    default:
      throw new Error(`Unknown LLM provider: "${config.provider}"`);
  }
}

