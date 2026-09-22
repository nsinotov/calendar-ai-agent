import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AnthropicProvider, type Effort } from "./anthropic-provider.js";
import { OpenAiProvider } from "./openai-provider.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider } from "./types.js";
export { LlmError } from "./errors.js";

// A union on `provider`: adding OpenAI later means one more member and one more case.
export type LlmConfig =
  | {
      provider: "anthropic";
      apiKey: string;
      model: string;
      maxTokens: number;
      effort?: Effort;
    }
  | {
      provider: "openai";
      apiKey: string;
      model: string;
      maxTokens: number;
    };

export function createLlmProvider(config: LlmConfig): LlmProvider {
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
  }
}

