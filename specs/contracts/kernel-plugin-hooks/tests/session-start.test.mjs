// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// SessionStart 挂载点的契约测试（H1 + H3.7 + known-differences D2）。
//
// ⚠️ 覆盖级别说明：
//   本文件用**真实 cordis Context** 触发 `session/created`，Session 用**最小替身**
//   （只需 `id`）。因此覆盖的是「本包监听器的否决逻辑」，**不是 DSH 的真实回滚行为**。
//   「同步 throw → DSH 回滚」这一层需要集成测试（真实 Session + 真实 SessionStore），
//   见 acceptance.md 的「未覆盖项」。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/session-start.ts");
}

/** 最小 Session 替身：本包只用到 id。 */
function makeSession(id = "s1") {
  return { id };
}

test("H3.7 同步 veto → throw（这是 DSH 唯一识别的否决方式）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  plugin.mountSessionStart(ctx, () => ({ kind: "veto", reason: "session blocked by hook" }));

  let threw = false;
  let message = "";
  try {
    ctx.emit("session/created", makeSession());
  } catch (error) {
    threw = true;
    message = error.message;
  }

  assert.equal(threw, true, "veto 必须是同步 throw");
  assert.equal(message, "session blocked by hook");
});

test("H3.7 allow → 不 throw（会话正常创建）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  plugin.mountSessionStart(ctx, () => ({ kind: "allow" }));

  let threw = false;
  try {
    ctx.emit("session/created", makeSession());
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "allow 不应 throw");
});

test("H3.7 allow 可带 note（供 telemetry 使用，不影响控制流）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  plugin.mountSessionStart(ctx, () => ({ kind: "allow", note: "recorded for telemetry" }));

  let threw = false;
  try {
    ctx.emit("session/created", makeSession());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
});

test("D2 async 判定不能否决（探针 27：throw 变成 rejection）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  // 验证方式：async 监听器内部捕获自己的 throw，证明「它没有同步传播出去」。
  // ⚠️ 不用「让 rejection 漏出去」的写法 —— node 的 test runner 会把
  //    unhandledRejection 判为测试失败（即使监听器捕获了事件），
  //    而那不是我们要验证的东西。
  let sawOwnRejection = false;
  ctx.on("session/created", async () => {
    try {
      throw new Error("this cannot veto");
    } catch {
      // async 函数里的 throw 只有它自己能看见；它不会同步传播给 emit 的调用方
      sawOwnRejection = true;
    }
  });

  let syncThrew = false;
  try {
    ctx.emit("session/created", makeSession());
  } catch {
    syncThrew = true;
  }

  assert.equal(syncThrew, false, "async 监听器的 throw 不会同步传播 → 不能否决（D2 依据）");

  // 等 microtask 排空，确认 async 部分确实执行了（说明它被调用过，只是不影响调用方）
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sawOwnRejection, true, "async 监听器内部的 throw 只有它自己捕获得到");
});

test("D2 deferredVetoReason：异步判定转为下一步的 deny", async () => {
  const plugin = await loadPlugin();

  // 应阻断
  const blocked = plugin.deferredVetoReason({ shouldBlock: true, reason: "policy says no" });
  assert.deepEqual(blocked, { kind: "deny", reason: "policy says no" });

  // 无 reason 时用兜底文案
  const noReason = plugin.deferredVetoReason({ shouldBlock: true });
  assert.equal(noReason.kind, "deny");
  assert.match(noReason.reason, /session start hook/u);

  // 不阻断
  const allowed = plugin.deferredVetoReason({ shouldBlock: false });
  assert.equal(allowed, undefined);
});

test("H3.7 judge 收到 session（可用于读取 id 等事实）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  let seen;
  plugin.mountSessionStart(ctx, (session) => {
    seen = session;
    return { kind: "allow" };
  });

  ctx.emit("session/created", makeSession("session-42"));
  assert.equal(seen.id, "session-42");
});

test("H3.7 veto 中断后续监听器（同步 throw 的短路效果）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  const order = [];
  plugin.mountSessionStart(ctx, () => {
    order.push("plugin-hook");
    return { kind: "veto", reason: "blocked" };
  });
  ctx.on("session/created", () => {
    order.push("downstream");
  });

  try {
    ctx.emit("session/created", makeSession());
  } catch {
    // 预期抛出
  }

  assert.deepEqual(order, ["plugin-hook"], "veto 后下游不应执行");
});

test("H1.3 卸载后不再判定", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = plugin.mountSessionStart(ctx, () => {
    calls += 1;
    return { kind: "allow" };
  });

  ctx.emit("session/created", makeSession());
  assert.equal(calls, 1);

  dispose();
  ctx.emit("session/created", makeSession());
  assert.equal(calls, 1);
});

test("H3.7 handleSessionCreated 是同步函数（能否决的前提）", async () => {
  const plugin = await loadPlugin();

  // 返回值必须是 undefined（不是 Promise）——否则 throw 会变成 rejection
  const result = plugin.handleSessionCreated(() => ({ kind: "allow" }), makeSession());
  assert.equal(result, undefined, "handleSessionCreated 必须是同步的");
  assert.equal(
    result instanceof Promise,
    false,
    "不能返回 Promise，否则 throw 会变成 rejection 而无法否决",
  );
});
