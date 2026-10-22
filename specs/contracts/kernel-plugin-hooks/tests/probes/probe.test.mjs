// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：实测 DSH 事件的真实载荷，以及 cordis 上下文在测试里怎么用。
//
// 这是实现阶段的第一件事，因为它决定：
//   ① exec.arguments 是已解析对象还是 JSON 字符串（→ tool_input 的构造方式）
//   ② 契约测试如何注册与触发 DSH 事件（→ 后续 6 个挂载点的测试模板）
//   ③ waterfall 的 next() 语义是否与文档一致
//
// 只读 DSH 公开 API，不修改、不 fork。
import assert from "node:assert/strict";
import test from "node:test";

/** 动态加载 DSH 公开模块（测试在 specs/ 下，按仓库路径解析）。 */
async function loadCordis() {
  return await import("@deepseek-ai/cordis");
}

test("探针 1：cordis Context 可创建，事件可注册与触发", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const seen = [];
  ctx.on("probe/ping", (payload) => {
    seen.push(payload);
  });

  await ctx.emit("probe/ping", { hello: "world" });
  assert.equal(seen.length, 1, "监听器应被调用一次");
  assert.deepEqual(seen[0], { hello: "world" });
});

test("探针 2（❌ 错误写法，保留作记录）：漏传 next 会 TypeError", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const order = [];
  // ⚠️ 这是我第一轮的**错误写法**：假设 cordis 会把 next 注入给监听器。
  // 实际约定是「next 由 ctx.waterfall() 调用时作为最后一个参数传入」
  // （events.d.ts L68-74），所以这里 next 是 undefined。
  ctx.on("probe/waterfall", (value, next) => {
    order.push("first");
    return next();
  });

  // 正确调用要传 innermost next 作为最后一个参数；不带 next 就会 TypeError
  let threw = false;
  let message = "";
  try {
    ctx.waterfall("probe/waterfall", { kind: "allow" });
  } catch (error) {
    threw = true;
    message = error.message;
  }

  assert.equal(threw, true, "漏传 next 应 TypeError（这正是第一轮踩的坑）");
  assert.match(message, /next is not a function/u);
  // 正确的写法见 probe2.test.mjs 的「探针 2b」
});

test("探针 3：serial 的 bail 语义（首个 bail 值即短路）", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const order = [];
  ctx.on("probe/serial", () => {
    order.push("first");
    return undefined; // 不 bail
  });
  ctx.on("probe/serial", () => {
    order.push("second");
    return "bail-value"; // bail
  });
  ctx.on("probe/serial", () => {
    order.push("third"); // 不应执行
    return undefined;
  });

  const result = await ctx.serial("probe/serial");
  assert.deepEqual(order, ["first", "second"], `bail 后不应执行 third，实际：${order.join(",")}`);
  assert.equal(result, "bail-value");
});

test("探针 4：tools/pre-execute 的真实载荷（exec.arguments 的类型）", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  let observed;
  ctx.on("tools/pre-execute", async (exec, next) => {
    observed = {
      argumentsType: typeof exec.arguments,
      isArray: Array.isArray(exec.arguments),
      isNull: exec.arguments === null,
      keys:
        exec.arguments && typeof exec.arguments === "object" ? Object.keys(exec.arguments) : null,
      nameType: typeof exec.name,
      callIdType: typeof exec.callId,
      hasSignal: exec.signal !== undefined,
      tokenType: typeof exec.token,
    };
    return await next();
  });

  // 模拟一次工具调用：DSH 文档说参数经过「lossless-JSON materialization boundary」后 deep-frozen
  const fakeExec = {
    callId: "call-1",
    name: "bash",
    arguments: { command: "echo hi", timeout: 1000 },
    signal: new AbortController().signal,
    token: Symbol("token"),
  };
  await ctx.waterfall("tools/pre-execute", fakeExec, () => Promise.resolve({ kind: "allow" }));

  assert.ok(observed, "监听器应被调用");
  console.log("    exec.arguments 实测：", JSON.stringify(observed));
  assert.equal(observed.nameType, "string");
  assert.equal(observed.callIdType, "string");
  assert.equal(observed.hasSignal, true);
  // 关键结论：传入对象时，监听器拿到的也是对象（cordis 不做 JSON 物化，物化是 DSH registry 做的）
  assert.equal(observed.argumentsType, "object");
});
