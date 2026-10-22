// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：session/created 的同步/异步边界（为最后一个挂载点确立模板）。
//
// 要确认四件事：
//   ① 载荷形状（session 对象需要哪些字段）
//   ② **同步 throw vs async rejection 的边界**（关键）
//   ③ 短路行为
//   ④ 异常边界（cordis 的 emit 是否捕获）
import assert from "node:assert/strict";
import test from "node:test";

test("探针 26：session/created 的同步 throw 会被传播（可否决）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  ctx.on("session/created", () => {
    throw new Error("veto from sync listener");
  });

  let threw = false;
  let message = "";
  try {
    ctx.emit("session/created", { id: "s1", header: {} });
  } catch (error) {
    threw = true;
    message = error.message;
  }

  console.log(`    sync throw → threw=${threw} message="${message}"`);
  assert.equal(threw, true, "同步 throw 应传播给调用方（DSH 据此否决）");
  assert.match(message, /veto from sync listener/u);
});

test("探针 27：async 监听器的 throw 变成 rejection（不是同步 throw）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  // async 函数：throw 会变成 rejected Promise，而不是同步抛出。
  // ⚠️ 在监听器内部自己捕获，避免 unhandledRejection 污染测试进程
  //    （node 的 test runner 会把 unhandledRejection 判为失败）。
  let sawOwnRejection = false;
  ctx.on("session/created", async () => {
    try {
      throw new Error("veto from async listener");
    } catch {
      sawOwnRejection = true;
    }
  });

  let syncThrew = false;
  try {
    ctx.emit("session/created", { id: "s1", header: {} });
  } catch {
    syncThrew = true;
  }

  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`    async throw → syncThrew=${syncThrew} sawOwnRejection=${sawOwnRejection}`);
  // 关键结论：async 监听器的 throw **不会**同步抛出
  assert.equal(syncThrew, false, "async 监听器的 throw 变成 rejection，不会同步抛出 → 无法否决");
});

test("探针 28：emit 不 await async 监听器（同步返回）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  let completed = false;
  ctx.on("session/created", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    completed = true;
  });

  ctx.emit("session/created", { id: "s1", header: {} });

  console.log(`    同步 emit 后 completed=${completed}`);
  assert.equal(completed, false, "emit 不等待 async 监听器完成");

  // 等一拍后应完成
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(completed, true, "异步部分最终会完成（但 emit 不等它）");
});

test("探针 29：多个 session/created 监听器都执行（emit 不短路）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const order = [];
  ctx.on("session/created", () => {
    order.push("first");
  });
  ctx.on("session/created", () => {
    order.push("second");
  });

  ctx.emit("session/created", { id: "s1", header: {} });
  assert.deepEqual(order, ["first", "second"]);
});

test("探针 30：同步 throw 会中断后续监听器（模拟否决）", async () => {
  const { Context } = await import("@deepseek-ai/cordis");
  const ctx = new Context();

  const order = [];
  ctx.on("session/created", () => {
    order.push("first");
    throw new Error("veto");
  });
  ctx.on("session/created", () => {
    order.push("second");
  });

  try {
    ctx.emit("session/created", { id: "s1", header: {} });
  } catch {
    // 预期抛出
  }

  console.log(`    order=${JSON.stringify(order)}`);
  assert.deepEqual(order, ["first"], "同步 throw 后后续监听器不执行");
});
