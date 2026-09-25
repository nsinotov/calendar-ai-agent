import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createCapabilitiesTool } from "./capabilities-tool.js";
import { defineTool } from "./tool.js";

const noInput = { type: "object" as const, properties: {} };
const first = defineTool({ name: "first", description: "Does the first thing.", inputSchema: noInput }, z.object({}), () => "a");
const second = defineTool({ name: "second", description: "Does the second thing.", inputSchema: noInput }, z.object({}), () => "b");

test("get_capabilities lists the name and description of every given tool", async () => {
  const result = JSON.parse(await createCapabilitiesTool([first, second]).execute({})) as unknown;

  assert.deepEqual(result, {
    capabilities: [
      { name: "first", description: "Does the first thing." },
      { name: "second", description: "Does the second thing." },
    ],
    commands: [],
  });
});

test("get_capabilities reflects the tool list it was given, so a disabled tool is absent", async () => {
  const result = JSON.parse(await createCapabilitiesTool([first]).execute({})) as { capabilities: { name: string }[] };

  assert.deepEqual(result.capabilities.map((tool) => tool.name), ["first"]);
});


test("get_capabilities lists the chat commands it was given", async () => {
  const commands = [{ usage: "/clear", description: "Clear the history." }];
  const result = JSON.parse(await createCapabilitiesTool([first], commands).execute({})) as { commands: unknown };

  assert.deepEqual(result.commands, commands);
});
