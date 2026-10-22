// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：agent/turn-stopping 的语义（为挂载点 5 确立模板）。
//
// 要确认三件事：
//   ① serial 模式下多个监听器的聚合（已知：首个 bail 值即短路，但要验证 Stop 的具体用法）
//   ② agent.steer 在测试里怎么造（需要 agent 对象）
//   ③ 「不做任何事时回合正常关闭」怎么表达
import assert from "node:assert/strict";
import test from "node:test";

test("探针 18：agent/turn-stopping 是 serial，监听器可 steer 让回合继续", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const steered = [];
  // 造一个最小的 agent 替身：只需要 steer 方法
  const agent = {
    steer(message) {
      steered.push(message);
    },
  };

  ctx.on("agent/turn-stopping", (payload) => {
    if (payload.turn === 1) {
      payload.agent.steer({
        id: "steer-1",
        role: "user",
        content: [{ type: "text", text: "continue please" }],
        source: { kind: "user" },
      });
    }
    // 不返回 bail 值 → 回合正常关闭
    return undefined;
  });

  await ctx.serial("agent/turn-stopping", {
    agent,
    turn: 1,
    signal: new AbortController().signal,
  });

  console.log(`    steered=${steered.length}`);
  assert.equal(steered.length, 1, "steer 应被调用一次");
  assert.equal(steered[0].content[0].text, "continue please");
});

test("探针 19：不 steer 时回合正常关闭（监听器不返回任何东西）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  let steerCalls = 0;
  const agent = {
    steer() {
      steerCalls += 1;
    },
  };

  ctx.on("agent/turn-stopping", () => {
    // 不动作
  });

  const result = await ctx.serial("agent/turn-stopping", {
    agent,
    turn: 1,
    signal: new AbortController().signal,
  });

  assert.equal(steerCalls, 0, "不应 steer");
  assert.equal(result, undefined, "serial 无 bail 值应返回 undefined");
});

test("探针 20：serial 的 bail 值短路后续监听器", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const order = [];
  const agent = { steer() {} };

  ctx.on("agent/turn-stopping", () => {
    order.push("first");
    return undefined; // 不 bail
  });
  ctx.on("agent/turn-stopping", () => {
    order.push("second");
    return "bail"; // bail
  });
  ctx.on("agent/turn-stopping", () => {
    order.push("third");
    return undefined;
  });

  const result = await ctx.serial("agent/turn-stopping", {
    agent,
    turn: 1,
    signal: new AbortController().signal,
  });

  console.log(`    order=${JSON.stringify(order)} result=${JSON.stringify(result)}`);
  assert.deepEqual(order, ["first", "second"], "bail 后不应执行 third");
  assert.equal(result, "bail");
});

test("探针 21：多个监听器都 steer 时都会执行（serial 不短路，除非 bail）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const steered = [];
  const agent = {
    steer(message) {
      steered.push(message.content[0].text);
    },
  };

  // 两个监听器都 steer，都不 bail
  ctx.on("agent/turn-stopping", (payload) => {
    payload.agent.steer({
      id: "a",
      role: "user",
      content: [{ type: "text", text: "from-hook-1" }],
      source: { kind: "user" },
    });
    return undefined;
  });
  ctx.on("agent/turn-stopping", (payload) => {
    payload.agent.steer({
      id: "b",
      role: "user",
      content: [{ type: "text", text: "from-hook-2" }],
      source: { kind: "user" },
    });
    return undefined;
  });

  await ctx.serial("agent/turn-stopping", {
    agent,
    turn: 1,
    signal: new AbortController().signal,
  });

  console.log(`    steered=${JSON.stringify(steered)}`);
  assert.deepEqual(steered, ["from-hook-1", "from-hook-2"], "两个监听器都应执行（无 bail）");
});
