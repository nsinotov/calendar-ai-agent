import type { z } from "zod";
import type { ToolDefinition } from "../llm/types.js";

export interface Tool {
  definition: ToolDefinition;
  // Returns the text handed back to the model; throws on failure.
  execute(input: Record<string, unknown>): Promise<string>;
}

// The JSON schema is written by hand: the zod schema only validates what the model sends.
export function defineTool<T>(
  definition: ToolDefinition,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  run: (args: T) => Promise<unknown> | unknown,
): Tool {
  return {
    definition,
    async execute(input) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        throw new Error(`Invalid arguments: ${formatIssues(parsed.error)}`);
      }

      return JSON.stringify(await run(parsed.data));
    },
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}

