// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针（修正版）：tools/result 的 emit 语义。
//
// ⚠️ 第一轮的误解（探针 23 失败）：
//   我以为 cordis 的 `emit` 会捕获监听器异常（因为 DSH 的 `tools/result` JSDoc 说
//   "Listener failures are contained"）。
//
//   实测 + 源码确认：**cordis 的 `emit` 不捕获异常** ——
//   `events.d.ts`：「Dispatch an event synchronously, ignoring listener return values.」
//   **containment 是 DSH 自己做的**（`dsh-tools` 在分发前包了 try/catch），
//   不是 cordis 的能力。
//
// → 所以本包的 `tools/result` 监听器**必须自己保证不抛**，
//   否则在真实 DSH 运行时里会依赖 DSH 的 containment；在单元测试里则会抛出来。
import assert from "node:assert/strict";
import test from "node:test";

test("探针 22b：tools/result 是 emit，返回值被忽略", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const observed = [];
  ctx.on("tools/result", (exec, result) => {
    observed.push({ name: exec.name, isError: result.isError });
    return { shouldBeIgnored: true };
  });

  ctx.emit("tools/result", { name: "bash" }, { isError: false, content: [] });

  assert.equal(observed.length, 1);
  assert.equal(observed[0].name, "bash");
});

test("探针 23b：cordis 的 emit **不捕获**监听器异常（containment 在 DSH 侧）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  ctx.on("tools/result", () => {
    throw new Error("listener blew up");
  });

  let threw = false;
  let message = "";
  try {
    ctx.emit("tools/result", { name: "bash" }, { isError: false, content: [] });
  } catch (error) {
    threw = true;
    message = error.message;
  }

  console.log(`    threw=${threw} message="${message}"`);
  assert.equal(threw, true, "cordis 的 emit 不捕获异常（与 parallel 不同）");
  assert.match(message, /listener blew up/u);
});

test("探针 24b：多个 tools/result 监听器都执行（emit 不短路）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const order = [];
  ctx.on("tools/result", () => {
    order.push("first");
  });
  ctx.on("tools/result", () => {
    order.push("second");
  });

  ctx.emit("tools/result", { name: "t" }, { isError: false, content: [] });
  assert.deepEqual(order, ["first", "second"]);
});

test("探针 25b：成功与失败结果都到达 tools/result", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const seen = [];
  ctx.on("tools/result", (_exec, result) => {
    seen.push(result.isError ? "failure" : "success");
  });

  ctx.emit("tools/result", { name: "t" }, { isError: false, content: [] });
  ctx.emit("tools/result", { name: "t" }, { isError: true, error: { message: "x" }, content: [] });

  assert.deepEqual(seen, ["success", "failure"]);
});
