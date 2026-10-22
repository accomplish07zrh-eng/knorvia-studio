// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针（第二轮）：修正 waterfall 的监听器签名。
//
// 第一轮的错误：我按 DSH 事件签名的写法 `(exec, next)` 去注册监听器，
// 但 cordis 的实际约定是「**最后一个事件参数**就是 next」——
// 监听器签名是 `(...事件参数, next)`，与 DSH 声明里的 `next` 位置一致，
// 但**测试里用 `ctx.on` 注册时，next 是随事件参数一起传进来的**。
//
// 依据：cordis/lib/types/events.d.ts L68-74
//   「Dispatch an event whose last argument is a `next` continuation.
//    Each listener wraps the rest of the chain: calling `next()` invokes the
//    next listener (finally the built-in behavior); not calling it vetoes.」
import assert from "node:assert/strict";
import test from "node:test";

async function loadCordis() {
  return await import("@deepseek-ai/cordis");
}

test("探针 2b：waterfall 的 next 是最后一个事件参数，不调 next 即 veto", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const order = [];

  // 监听器签名：(...事件参数, next)。这里事件参数是 value，所以监听器是 (value, next)。
  // 但 next 来自「调用 waterfall 时传入的最后一个参数」，不是 cordis 注入的。
  ctx.on("probe/waterfall", (value, next) => {
    order.push(`first:${typeof next}`);
    return next();
  });
  ctx.on("probe/waterfall", () => {
    order.push("second:veto");
    return { kind: "deny", reason: "blocked" };
  });
  ctx.on("probe/waterfall", (value, next) => {
    order.push("third");
    return next();
  });

  // 调用时把 innermost next 作为最后一个参数传入
  const result = await ctx.waterfall("probe/waterfall", { kind: "allow" }, () => ({
    kind: "allow",
  }));

  console.log(`    order=${JSON.stringify(order)} result=${JSON.stringify(result)}`);
  assert.equal(order[0], "first:function", "第一个监听器的 next 应是函数");
  assert.ok(order.includes("second:veto"), "第二个监听器应执行（说明 first 调了 next）");
  assert.ok(!order.includes("third"), "第二个监听器不调 next → 第三个不应执行（veto）");
  assert.equal(result.kind, "deny");
});

test("探针 5：tools/pre-execute 的完整 waterfall 链路（含 next 传递）", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const trace = [];
  ctx.on("tools/pre-execute", async (exec, next) => {
    trace.push(`hook:${exec.name}`);
    return await next();
  });

  // DSH 的 innermost next 是「委托为 allow」
  const result = await ctx.waterfall(
    "tools/pre-execute",
    {
      callId: "c1",
      name: "bash",
      arguments: { command: "ls" },
      signal: new AbortController().signal,
      token: Symbol("t"),
    },
    async () => ({ kind: "allow" }),
  );

  console.log(`    trace=${JSON.stringify(trace)} result=${JSON.stringify(result)}`);
  assert.deepEqual(trace, ["hook:bash"]);
  assert.equal(result.kind, "allow");
});

test("探针 6：deny 时 Hook 直接返回、不调 next（模拟阻断）", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const trace = [];
  // 本包 Hook 的模拟：命中规则时 deny
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.arguments.command.includes("rm -rf")) {
      trace.push("denied");
      return { kind: "deny", reason: "destructive command blocked by hook" };
    }
    trace.push("allowed");
    return await next();
  });

  const denied = await ctx.waterfall(
    "tools/pre-execute",
    {
      callId: "c1",
      name: "bash",
      arguments: { command: "rm -rf /" },
      signal: new AbortController().signal,
      token: Symbol("t"),
    },
    async () => ({ kind: "allow" }),
  );

  console.log(`    trace=${JSON.stringify(trace)} result=${JSON.stringify(denied)}`);
  assert.deepEqual(trace, ["denied"]);
  assert.equal(denied.kind, "deny");
  assert.match(denied.reason, /destructive/u);
});
