import assert from "node:assert/strict";
import { test } from "node:test";
import { Bot } from "grammy";
import { TelegramMessagingProvider } from "./telegram-provider.js";
import type { IncomingMessage } from "./types.js";

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function testBot(): { bot: Bot; calls: ApiCall[] } {
  const bot = new Bot("123:test", {
    botInfo: {
      id: 1,
      is_bot: true,
      first_name: "Test",
      username: "test_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
  });
  const calls: ApiCall[] = [];
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });

    return { ok: true, result: true } as never;
  });

  return { bot, calls };
}

function textUpdate(chatType: "private" | "group", userId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: userId, type: chatType, first_name: "A" },
      from: { id: userId, is_bot: false, first_name: "A" },
      text,
    },
  } as Parameters<Bot["handleUpdate"]>[0];
}

test("private text messages reach the handler with the sender id", async () => {
  const { bot } = testBot();
  const received: IncomingMessage[] = [];
  new TelegramMessagingProvider(bot).onMessage(async (message) => {
    received.push(message);
  });

  await bot.handleUpdate(textUpdate("private", 42, "hello"));

  assert.deepEqual(received, [{ userId: 42, text: "hello" }]);
});

test("group messages are ignored", async () => {
  const { bot } = testBot();
  const received: IncomingMessage[] = [];
  new TelegramMessagingProvider(bot).onMessage(async (message) => {
    received.push(message);
  });

  await bot.handleUpdate(textUpdate("group", 42, "hello"));

  assert.deepEqual(received, []);
});

test("send() posts plain text to the user's chat", async () => {
  const { bot, calls } = testBot();

  await new TelegramMessagingProvider(bot).send(42, "hi");

  assert.deepEqual(calls, [{ method: "sendMessage", payload: { chat_id: 42, text: "hi" } }]);
});

test("send() splits text over the Telegram limit into several messages", async () => {
  const { bot, calls } = testBot();

  await new TelegramMessagingProvider(bot).send(42, "a".repeat(5000));

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => String(call.payload.text).length <= 4096));
});

