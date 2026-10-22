// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Stop 挂载点的契约测试（H1 + H3.6 + known-differences D2）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  const [turnStopping, verdict] = await Promise.all([
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/turn-stopping.ts"),
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/verdict.ts"),
  ]);
  return { turnStopping, verdict };
}

/** 造一个记录 steer 调用的 agent 替身。 */
function makeAgent() {
  const steered = [];
  return {
    steered,
    agent: {
      steer(message) {
        steered.push(message);
      },
    },
  };
}

function makePayload(agent, turn = 1) {
  return { agent, turn, signal: new AbortController().signal };
}

async function runSerial(ctx, payload) {
  return await ctx.serial("agent/turn-stopping", payload);
}

test("H3.6 deny → steer（「拒绝停止」即「继续」）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  turnStopping.mountTurnStopping(ctx, {
    judge: async () => ({ kind: "deny", reason: "must finish the task first" }),
  });

  await runSerial(ctx, makePayload(agent));

  assert.equal(steered.length, 1, "deny 应触发 steer");
  assert.equal(steered[0].content[0].text, "must finish the task first");
  assert.equal(steered[0].role, "user", "steer 的消息是 user 角色");
});

test("H3.6 无意见 → 不 steer，回合正常关闭", async () => {
  const { turnStopping, verdict } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  turnStopping.mountTurnStopping(ctx, { judge: async () => verdict.NO_OPINION });

  const result = await runSerial(ctx, makePayload(agent));
  assert.equal(steered.length, 0, "无意见不应 steer");
  assert.equal(result, undefined, "无 bail 值时 serial 返回 undefined");
});

test("H3.6 allow → 不 steer（回合正常关闭）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  turnStopping.mountTurnStopping(ctx, { judge: async () => ({ kind: "allow" }) });
  await runSerial(ctx, makePayload(agent));

  assert.equal(steered.length, 0);
});

test("H3.6 ask → 不 steer（Stop 阶段无审批对象）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  turnStopping.mountTurnStopping(ctx, { judge: async () => ({ kind: "ask", reason: "review" }) });
  await runSerial(ctx, makePayload(agent));

  assert.equal(steered.length, 0);
});

test("H3.6 判定输入映射：turn / signal", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent } = makeAgent();

  let seen;
  turnStopping.mountTurnStopping(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "allow" };
    },
  });

  const signal = new AbortController().signal;
  await runSerial(ctx, { agent, turn: 5, signal });

  assert.equal(seen.turn, 5);
  assert.equal(seen.signal, signal);
});

test("D2 多个 Stop 监听器都执行（serial 不短路，聚合结论等价）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  const order = [];
  turnStopping.mountTurnStopping(ctx, {
    judge: async () => {
      order.push("plugin-hook-1");
      return { kind: "deny", reason: "continue-1" };
    },
  });
  ctx.on("agent/turn-stopping", () => {
    order.push("other-listener");
    return undefined; // 不 bail
  });

  await runSerial(ctx, makePayload(agent));

  // 与旧行为（按序短路）不同：两个都执行了
  assert.deepEqual(order, ["plugin-hook-1", "other-listener"], "serial 不短路，两个都执行");
  assert.equal(steered.length, 1, "本包仍只 steer 一次");
});

test("H3.6 本包不返回 bail 值（避免短路其他 Stop 监听器）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent } = makeAgent();

  turnStopping.mountTurnStopping(ctx, {
    judge: async () => ({ kind: "deny", reason: "continue" }),
  });
  let otherRan = false;
  ctx.on("agent/turn-stopping", () => {
    otherRan = true;
    return undefined;
  });

  await runSerial(ctx, makePayload(agent));
  assert.equal(otherRan, true, "本包不 bail，其他监听器应执行");
});

test("H1.3 卸载后监听器注销", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  let calls = 0;
  const dispose = turnStopping.mountTurnStopping(ctx, {
    judge: async () => {
      calls += 1;
      return { kind: "deny", reason: "continue" };
    },
  });

  await runSerial(ctx, makePayload(agent));
  assert.equal(calls, 1);
  assert.equal(steered.length, 1);

  dispose();
  await runSerial(ctx, makePayload(agent));
  assert.equal(calls, 1, "卸载后不应再调用 judge");
  assert.equal(steered.length, 1, "卸载后不应再 steer");
});

test("H3.6 steer 消息字段完整（id/role/content/source）", async () => {
  const { turnStopping } = await loadPlugin();
  const ctx = new Context();
  const { agent, steered } = makeAgent();

  turnStopping.mountTurnStopping(ctx, {
    judge: async () => ({ kind: "deny", reason: "continue" }),
  });
  await runSerial(ctx, makePayload(agent));

  const message = steered[0];
  assert.equal(typeof message.id, "string");
  assert.ok(message.id.length > 0);
  assert.equal(message.role, "user");
  assert.deepEqual(message.source, { kind: "user" });
  assert.equal(message.content[0].type, "text");
});
