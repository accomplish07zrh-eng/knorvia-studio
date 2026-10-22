// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 纯观测挂载点的契约测试（H1 + H6）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/result-observer.ts");
}

function successResult(content = [{ type: "text", text: "ok" }]) {
  return { isError: false, content };
}

function failureResult(message = "boom") {
  return { isError: true, error: { message }, content: [{ type: "text", text: message }] };
}

test("H6 观测成功结果：字段映射正确", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  const observed = [];
  plugin.mountResultObserver(ctx, {
    observe: (input) => observed.push(input),
  });

  ctx.emit("tools/result", { name: "bash", callId: "c1" }, successResult());

  assert.equal(observed.length, 1);
  assert.equal(observed[0].toolName, "bash");
  assert.equal(observed[0].toolUseId, "c1");
  assert.equal(observed[0].isError, false);
  assert.equal(observed[0].contentBlockCount, 1);
  assert.equal(observed[0].errorMessage, undefined);
});

test("H6 观测失败结果：errorMessage 取自 result.error.message", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  const observed = [];
  plugin.mountResultObserver(ctx, { observe: (input) => observed.push(input) });

  ctx.emit("tools/result", { name: "bash" }, failureResult("command not found"));

  assert.equal(observed[0].isError, true);
  assert.equal(observed[0].errorMessage, "command not found");
});

test("H6 观测回调抛错被吞掉（cordis 的 emit 不捕获，本包必须自己保证）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  plugin.mountResultObserver(ctx, {
    observe: () => {
      throw new Error("observer blew up");
    },
  });

  // 不应抛到调用方：观测失败不能影响工具执行
  let threw = false;
  try {
    ctx.emit("tools/result", { name: "bash" }, successResult());
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "观测失败必须被吞掉");
});

test("H6 多个观测监听器都执行（emit 不短路）", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  const order = [];
  plugin.mountResultObserver(ctx, { observe: () => order.push("first") });
  plugin.mountResultObserver(ctx, { observe: () => order.push("second") });

  ctx.emit("tools/result", { name: "bash" }, successResult());
  assert.deepEqual(order, ["first", "second"]);
});

test("H6 可选字段缺失时正常观测", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  const observed = [];
  plugin.mountResultObserver(ctx, { observe: (input) => observed.push(input) });

  ctx.emit("tools/result", { name: "bash" }, successResult([]));

  assert.equal(observed[0].toolUseId, undefined);
  assert.equal(observed[0].contentBlockCount, 0);
});

test("H1.3 卸载后不再观测", async () => {
  const plugin = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = plugin.mountResultObserver(ctx, {
    observe: () => {
      calls += 1;
    },
  });

  ctx.emit("tools/result", { name: "bash" }, successResult());
  assert.equal(calls, 1);

  dispose();
  ctx.emit("tools/result", { name: "bash" }, successResult());
  assert.equal(calls, 1, "卸载后不应再观测");
});

test("H6 safeObserve 是纯函数式的：不修改 payload 或 result", async () => {
  const plugin = await loadPlugin();

  const payload = { name: "bash", callId: "c1" };
  const result = successResult();
  const before = JSON.stringify({ payload, result });

  plugin.safeObserve({ observe: () => {} }, payload, result);

  assert.equal(JSON.stringify({ payload, result }), before, "不应修改入参");
});
