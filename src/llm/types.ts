// Provider-neutral types. The agent and the tools only ever see these.

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  callId: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  content: (TextBlock | ToolCallBlock)[];
  stopReason: StopReason;
  usage: LlmUsage;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

