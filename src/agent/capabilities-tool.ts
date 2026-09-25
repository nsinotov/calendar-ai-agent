import { z } from "zod";
import { defineTool, type Tool } from "./tool.js";

export interface CommandInfo {
  usage: string;
  description: string;
}

// `commands` are the chat commands available to this user, e.g. "/clear".
export function createCapabilitiesTool(tools: Tool[], commands: CommandInfo[] = []): Tool {
  return defineTool(
    {
      name: "get_capabilities",
      description:
        "List what this assistant can do. Call it when the user asks what you can do or how you can help. Summarize the result in a short, friendly way in plain words, without tool names, and mention the available commands with their usage.",
      inputSchema: { type: "object", properties: {} },
    },
    z.object({}),
    () => ({
      capabilities: tools.map(({ definition }) => ({ name: definition.name, description: definition.description })),
      commands: commands.map(({ usage, description }) => ({ usage, description })),
    }),
  );
}

