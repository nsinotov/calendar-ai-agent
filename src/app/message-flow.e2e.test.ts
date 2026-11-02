// End-to-end message flow: the real handler, agent, tools, storage and billing wired as in
// index.ts. Only the outside world is faked: a scripted LLM, an in-memory calendar and messenger.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { Agent } from "../agent/index.js";
import { BillingLlmProvider } from "../billing/billing-llm-provider.js";
import { BillingService } from "../billing/billing-service.js";
import type { CalendarEvent, CalendarProvider, EventInput } from "../calendar/types.js";
import { createStorage, type Storage } from "../db/index.js";
import type { LlmProvider, LlmRequest, LlmResponse, ToolCallBlock, ToolResultBlock } from "../llm/types.js";
import type { MessagingProvider } from "../messaging/index.js";
import { AccessControl } from "./access-control.js";
import { createAgentContextBuilder } from "./agent-context.js";
import { createCommands } from "./commands.js";
import { createMessageHandler } from "./message-handler.js";

const USER = 1;
const USAGE = { inputTokens: 10, outputTokens: 5 };

type Step = (request: LlmRequest) => LlmResponse;

class ScriptedLlm implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  constructor(private readonly steps: Step[]) {}

  complete(request: LlmRequest): Promise<LlmResponse> {
    const step = this.steps[this.requests.length];
    this.requests.push(structuredClone(request));
    if (!step) {
      throw new Error(`Unexpected LLM call #${this.requests.length}`);
    }

    return Promise.resolve(step(request));
  }
}

class MemoryCalendar implements CalendarProvider {
  readonly events: CalendarEvent[] = [];

  listEvents(): Promise<CalendarEvent[]> {
    return Promise.resolve([...this.events]);
  }

  createEvent(input: EventInput): Promise<CalendarEvent> {
    const event: CalendarEvent = { id: `e${this.events.length + 1}`, status: "confirmed", ...input };
    this.events.push(event);

    return Promise.resolve(event);
  }

  updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      return Promise.reject(new Error(`No event ${id}`));
    }
    Object.assign(event, input);

    return Promise.resolve(event);
  }

  deleteEvent(id: string): Promise<void> {
    this.events.splice(
      this.events.findIndex((e) => e.id === id),
      1,
    );

    return Promise.resolve();
  }

  canDelete(): boolean {
    return true;
  }
}

function text(value: string): LlmResponse {
  return { content: [{ type: "text", text: value }], stopReason: "end_turn", usage: USAGE };
}

function call(name: string, input: Record<string, unknown>, id = "call-1"): LlmResponse {
  return { content: [{ type: "tool_call", id, name, input }], stopReason: "tool_use", usage: USAGE };
}

function lastToolResult(request: LlmRequest): ToolResultBlock {
  const content = request.messages.at(-1)?.content;
  const result = Array.isArray(content) ? content.find((block) => block.type === "tool_result") : undefined;
  assert.ok(result, "the last message should carry a tool result");

  return result;
}

const dirs: string[] = [];
const storages: Storage[] = [];

afterEach(() => {
  storages.splice(0).forEach((storage) => storage.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function setup(steps: Step[]) {
  const dir = mkdtempSync(join(tmpdir(), "calendar-agent-e2e-"));
  dirs.push(dir);
  const storage = createStorage({
    provider: "sqlite",
    dataDir: dir,
    encryptionKeyHex: "00".repeat(32),
    contextRetentionDays: 7,
  });
  storages.push(storage);
  storage.users.upsert(USER, "user");

  const scripted = new ScriptedLlm(steps);
  const billing = new BillingService(
    storage.billing,
    { notifyAdmins: async () => {}, broadcast: async () => {} },
    { prices: null, lowBalanceUsd: 1, probeIntervalMs: 60_000 },
  );
  const llm = new BillingLlmProvider(scripted, billing);
  const calendar = new MemoryCalendar();
  const sent: string[] = [];
  const messaging: MessagingProvider = {
    onMessage() {},
    send: async (_userId, value) => {
      sent.push(value);
    },
    start: async () => {},
    stop: async () => {},
  };
  const commands = createCommands({
    conversations: storage.conversations,
    billing,
    llm,
    languageOf: (userId) => storage.settings.get(userId).language,
  });
  const handler = createMessageHandler({
    messaging,
    access: new AccessControl(storage.users),
    agent: new Agent(llm, storage.conversations),
    users: storage.users,
    billing,
    commands,
    buildContext: createAgentContextBuilder({
      storage,
      llm,
      commands,
      resolveCalendar: () => calendar,
      allowedTopics: [],
      suggestionsEnabled: false,
      toolResultRetentionMinutes: 60,
    }),
  });

  return { handler: (value: string) => handler({ userId: USER, text: value }), scripted, calendar, sent, storage };
}

test("a chat request creates a calendar event through the model's tool call", async () => {
  const { handler, scripted, calendar, sent } = setup([
    (request) => {
      assert.ok(request.tools.some((tool) => tool.name === "create_event"));

      return call("create_event", {
        title: "Dentist",
        start: "2026-11-06T15:00:00+02:00",
        end: "2026-11-06T16:00:00+02:00",
      });
    },
    (request) => {
      assert.match(lastToolResult(request).content, /Dentist/);

      return text("Added: Dentist on Friday at 15:00.");
    },
  ]);

  await handler("Dentist on Friday at 3");

  assert.equal(calendar.events.length, 1);
  assert.equal(calendar.events[0]?.title, "Dentist");
  assert.deepEqual(calendar.events[0]?.start, { allDay: false, value: "2026-11-06T15:00:00+02:00" });
  assert.deepEqual(sent, ["Added: Dentist on Friday at 15:00."]);
  assert.equal(scripted.requests.length, 2);
});

test("invalid tool input goes back to the model as an error, and its corrected call succeeds", async () => {
  const { handler, calendar, sent } = setup([
    () => call("create_event", { title: "Gym", start: "2026-11-06T18:00:00+02:00" }),
    (request) => {
      const result = lastToolResult(request);
      assert.equal(result.isError, true);
      assert.match(result.content, /end/);

      return call(
        "create_event",
        { title: "Gym", start: "2026-11-06T18:00:00+02:00", end: "2026-11-06T19:00:00+02:00" },
        "call-2",
      );
    },
    (request) => {
      assert.notEqual(lastToolResult(request).isError, true);

      return text("Gym added.");
    },
  ]);

  await handler("Gym on Friday at 6 pm");

  assert.deepEqual(
    calendar.events.map((event) => event.title),
    ["Gym"],
  );
  assert.deepEqual(sent, ["Gym added."]);
});

test("a note saved in one message is stored and recalled in the next one", async () => {
  const { handler, scripted, sent, storage } = setup([
    () => call("add_note", { text: "milk", context: "market" }),
    () => text("Saved."),
    (request) => {
      assert.ok(
        request.messages.some((message) => message.content === "Remember to buy milk at the market"),
        "the earlier message should be in the history",
      );

      return call("list_notes", { context: "market" }, "call-2");
    },
    (request) => {
      assert.match(lastToolResult(request).content, /milk/);

      return text("At the market: milk.");
    },
  ]);

  await handler("Remember to buy milk at the market");
  await handler("What do I need at the market?");

  assert.equal(storage.notes.list(USER).length, 1);
  assert.deepEqual(sent, ["Saved.", "At the market: milk."]);
  assert.equal(scripted.requests.length, 4);
});

test("tool calls are visible to the model in the stored history", async () => {
  const { handler, scripted } = setup([
    () => call("add_note", { text: "bread" }),
    () => text("Saved."),
    () => text("You asked me to save bread."),
  ]);

  await handler("Note: bread");
  await handler("What did I ask?");

  const history = scripted.requests[2]?.messages ?? [];
  const calls = history.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((block): block is ToolCallBlock => block.type === "tool_call")
      : [],
  );
  assert.deepEqual(
    calls.map((block) => block.name),
    ["add_note"],
  );
});
