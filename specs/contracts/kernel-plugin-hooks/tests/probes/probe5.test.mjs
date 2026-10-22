// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：agent/pre-step 的语义（为挂载点 4 确立模板）。
//
// 要确认三件事：
//   ① `enter` 是「替换 messages」还是「追加」
//   ② `reject` 的后果
//   ③ `startsRequestSeries` 的语义
import assert from "node:assert/strict";
import test from "node:test";

/** 造一条最小 UserMessage（字段依据 dsh-llm message.d.ts L124-133）。 */
function userMessage(text, id = "m1") {
  return {
    id,
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

test("探针 15：agent/pre-step 是 waterfall，可 reject / enter / 委托", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  ctx.on("agent/pre-step", async (payload, next) => {
    const text = payload.messages.map((m) => m.content[0]?.text ?? "").join(",");
    if (text.includes("block-me")) return { kind: "reject" };
    if (text.includes("inject-me")) {
      return { kind: "enter", messages: [...payload.messages, userMessage("injected", "m2")] };
    }
    return await next();
  });

  const payload = (text) => ({
    messages: [userMessage(text)],
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  });

  // 委托
  const delegated = await ctx.waterfall("agent/pre-step", payload("hello"), async () => ({
    kind: "enter",
    messages: [userMessage("hello")],
  }));
  assert.equal(delegated.kind, "enter");
  assert.equal(delegated.messages.length, 1);

  // 拒绝
  const rejected = await ctx.waterfall("agent/pre-step", payload("block-me"), async () => ({
    kind: "enter",
    messages: [],
  }));
  assert.equal(rejected.kind, "reject");

  // 注入
  const injected = await ctx.waterfall("agent/pre-step", payload("inject-me"), async () => ({
    kind: "enter",
    messages: [],
  }));
  assert.equal(injected.kind, "enter");
  assert.equal(injected.messages.length, 2, "enter 应带上原 messages + 注入的");
  assert.equal(injected.messages[1].content[0].text, "injected");
});

test("探针 16：enter 的 messages 决定进入步骤的内容（替换语义）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  ctx.on("agent/pre-step", () => ({
    kind: "enter",
    messages: [userMessage("replaced")], // 只给一条，替换掉原来的
  }));

  const result = await ctx.waterfall(
    "agent/pre-step",
    {
      messages: [userMessage("original-1"), userMessage("original-2", "m2")],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    },
    async () => ({ kind: "enter", messages: [] }),
  );

  console.log(`    enter 后的 messages 数：${result.messages.length}`);
  assert.equal(result.messages.length, 1, "enter 是替换语义：只保留返回的 messages");
  assert.equal(result.messages[0].content[0].text, "replaced");
});

test("探针 17：startsRequestSeries 可设为 true（语义待真实运行时验证）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  ctx.on("agent/pre-step", () => ({
    kind: "enter",
    messages: [userMessage("series-start")],
    startsRequestSeries: true,
  }));

  const result = await ctx.waterfall(
    "agent/pre-step",
    {
      messages: [userMessage("x")],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    },
    async () => ({ kind: "enter", messages: [] }),
  );

  assert.equal(result.kind, "enter");
  assert.equal(result.startsRequestSeries, true, "startsRequestSeries 可传递");
  // ⚠️ 它的实际效果（新回合 vs 延续）需真实运行时验证，cordis 层只验证传递性
});
