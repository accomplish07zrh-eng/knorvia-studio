// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：approval/request 的 waterfall 行为（为第二个挂载点确立模板）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

test("探针 7：approval/request 是 waterfall，返回 outcome 即认领", async () => {
  const { Context: Ctx } = await import("@deepseek-ai/cordis");
  const ctx = new Ctx();

  const trace = [];
  ctx.on("approval/request", async (req, next) => {
    trace.push(`hook:${req.toolName}`);
    if (req.toolName === "dangerous") return "rejected";
    return await next();
  });

  // 认领：返回 rejected
  const claimed = await ctx.waterfall(
    "approval/request",
    { toolName: "dangerous" },
    async () => "unavailable",
  );
  assert.equal(claimed, "rejected", "返回 outcome 即认领");

  // 委托：调 next() 拿到下游值
  const delegated = await ctx.waterfall(
    "approval/request",
    { toolName: "safe" },
    async () => "allowed-once",
  );
  assert.equal(delegated, "allowed-once", "委托应拿到下游的 outcome");

  console.log(`    trace=${JSON.stringify(trace)}`);
  assert.deepEqual(trace, ["hook:dangerous", "hook:safe"]);
});

test("探针 8：ApprovalOutcome 四值可用", async () => {
  const outcomes = ["allowed-once", "rejected", "cancelled", "unavailable"];
  const { Context: Ctx } = await import("@deepseek-ai/cordis");

  for (const outcome of outcomes) {
    const ctx = new Ctx();
    ctx.on("approval/request", () => outcome);
    const result = await ctx.waterfall(
      "approval/request",
      { toolName: "t" },
      async () => "unavailable",
    );
    assert.equal(result, outcome, `应能返回 ${outcome}`);
  }
});

test("探针 9：不调 next() 即认领（下游不执行）", async () => {
  const { Context: Ctx } = await import("@deepseek-ai/cordis");
  const ctx = new Ctx();

  const order = [];
  ctx.on("approval/request", () => {
    order.push("hook");
    return "rejected";
  });
  ctx.on("approval/request", async (_req, next) => {
    order.push("downstream");
    return await next();
  });

  const result = await ctx.waterfall(
    "approval/request",
    { toolName: "t" },
    async () => "unavailable",
  );
  assert.deepEqual(order, ["hook"], "认领后下游不应执行");
  assert.equal(result, "rejected");
});
