// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 探针：tools/post-execute 的 result 是 deep-frozen，确认能否返回替换内容。
//
// 为第三个挂载点（PostToolUse / PostToolUseFailure）确立模板。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

/** 造一个与 DSH 类型一致的 frozen result。 */
function frozenSuccess(value = { ok: true }) {
  return Object.freeze({
    isError: false,
    value,
    content: [{ type: "text", text: "done" }],
  });
}

function frozenFailure(message = "boom") {
  return Object.freeze({
    isError: true,
    error: Object.freeze({ message }),
    content: [{ type: "text", text: message }],
  });
}

test("探针 10：tools/post-execute 是 waterfall，可返回替换决策", async () => {
  const { Context: Ctx } = await import("@deepseek-ai/cordis");
  const ctx = new Ctx();

  ctx.on("tools/post-execute", async (exec, result, next) => {
    if (result.isError) {
      // 失败分支：返回 block + feedback
      return { kind: "block", feedback: [{ type: "text", text: "hook intercepted failure" }] };
    }
    return await next();
  });

  const successDecision = await ctx.waterfall(
    "tools/post-execute",
    { name: "bash" },
    frozenSuccess(),
    async () => ({ kind: "accept" }),
  );
  assert.equal(successDecision.kind, "accept", "成功结果应委托");

  const failureDecision = await ctx.waterfall(
    "tools/post-execute",
    { name: "bash" },
    frozenFailure(),
    async () => ({ kind: "accept" }),
  );
  assert.equal(failureDecision.kind, "block", "失败结果应被 Hook 拦截");
});

test("探针 11：frozen result 不可原地修改（确认 deep-frozen）", async () => {
  const result = frozenSuccess();
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => {
    "use strict";
    result.isError = true;
  }, "frozen 对象不能原地修改");
});

test("探针 12：additionalContexts 可随决策返回（同回合注入）", async () => {
  const { Context: Ctx } = await import("@deepseek-ai/cordis");
  const ctx = new Ctx();

  const contextMessage = { role: "user", content: [{ type: "text", text: "hook note" }] };

  ctx.on("tools/post-execute", async (_exec, _result, next) => {
    const downstream = await next();
    // 在委托结果上追加 additionalContexts
    if (downstream.kind === "accept") {
      return { ...downstream, additionalContexts: [contextMessage] };
    }
    return downstream;
  });

  const decision = await ctx.waterfall(
    "tools/post-execute",
    { name: "bash" },
    frozenSuccess(),
    async () => ({ kind: "accept" }),
  );

  assert.equal(decision.kind, "accept");
  assert.equal(decision.additionalContexts?.length, 1, "应带上 additionalContexts");
  assert.equal(decision.additionalContexts[0].content[0].text, "hook note");
});

test("探针 13：isError 判别成功/失败（对应 PostToolUse / PostToolUseFailure）", async () => {
  const seen = [];
  const { Context: Ctx } = await import("@deepseek-ai/cordis");
  const ctx = new Ctx();

  ctx.on("tools/post-execute", async (_exec, result, next) => {
    seen.push(result.isError ? "failure" : "success");
    return await next();
  });

  await ctx.waterfall("tools/post-execute", { name: "t" }, frozenSuccess(), async () => ({
    kind: "accept",
  }));
  await ctx.waterfall("tools/post-execute", { name: "t" }, frozenFailure(), async () => ({
    kind: "accept",
  }));

  assert.deepEqual(seen, ["success", "failure"]);
});

test("探针 14：失败结果的 error.message 可取（对应旧 error 字段）", async () => {
  const result = frozenFailure("command not found");
  assert.equal(result.isError, true);
  assert.equal(result.error.message, "command not found");
});
