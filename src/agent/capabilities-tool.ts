import { z } from "zod";
import { defineTool, type Tool } from "./tool.js";

export function createCapabilitiesTool(tools: Tool[]): Tool {
  return defineTool(
    {
      name: "get_capabilities",
      description:
        "List what this assistant can do. Call it when the user asks what you can do or how you can help. Summarize the result in a short, friendly way in plain words, without tool names.",
      inputSchema: { type: "object", properties: {} },
    },
    z.object({}),
    () => ({
      capabilities: tools.map(({ definition }) => ({ name: definition.name, description: definition.description })),
    }),
  );
}

