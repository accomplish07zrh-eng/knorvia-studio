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

test("探针 2：waterfall 的 next() 语义（可短路）", async () => {
  const { Context } = await loadCordis();
  const ctx = new Context();

  const order = [];
  // 第一个监听器：不改，委托
  ctx.on("probe/waterfall", async (value, next) => {
    order.push("first");
    return await next();
  });
  // 第二个监听器：短路，不调 next()
  ctx.on("probe/waterfall", async () => {
    order.push("second");
    return { kind: "deny", reason: "blocked by second" };
  });
  // 第三个监听器：若 second 短路，它不应被执行
  ctx.on("probe/waterfall", async (_value, next) => {
    order.push("third");
    return await next();
  });

  const result = await ctx.waterfall("probe/waterfall", { kind: "allow" });
  assert.deepEqual(order, ["first", "second"], `短路后不应执行 third，实际：${order.join(",")}`);
  assert.equal(result.kind, "deny");
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
