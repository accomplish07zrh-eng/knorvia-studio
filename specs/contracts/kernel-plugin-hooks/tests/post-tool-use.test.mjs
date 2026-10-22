// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PostToolUse / PostToolUseFailure 挂载点的契约测试（H1 + H3.3 + H3.4）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  const [postToolUse, verdict] = await Promise.all([
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/post-tool-use.ts"),
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/verdict.ts"),
  ]);
  return { postToolUse, verdict };
}

function successResult(value = { ok: true }) {
  return { isError: false, value, content: [{ type: "text", text: "done" }] };
}

function failureResult(message = "boom") {
  return { isError: true, error: { message }, content: [{ type: "text", text: message }] };
}

async function runWaterfall(ctx, exec, result, downstream = { kind: "accept" }) {
  return await ctx.waterfall("tools/post-execute", exec, result, async () => downstream);
}

test("H3.3 无意见时委托（成功结果）", async () => {
  const { postToolUse, verdict } = await loadPlugin();
  const ctx = new Context();
  postToolUse.mountPostToolUse(ctx, { judge: async () => verdict.NO_OPINION });

  const result = await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.equal(result.kind, "accept");
});

test("H3.3 allow → 显式 accept", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();
  postToolUse.mountPostToolUse(ctx, { judge: async () => ({ kind: "allow" }) });

  const result = await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.equal(result.kind, "accept");
});

test("H3.3 deny → block + feedback（工具已执行，只能转成错误结果）", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();
  postToolUse.mountPostToolUse(ctx, {
    judge: async () => ({ kind: "deny", reason: "output contains secret" }),
  });

  const result = await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.equal(result.kind, "block");
  assert.equal(result.feedback[0].text, "output contains secret");
});

test("H3.3 ask → 委托（工具已执行，审批无对象）", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();
  postToolUse.mountPostToolUse(ctx, {
    judge: async () => ({ kind: "ask", reason: "needs review" }),
  });

  const result = await runWaterfall(ctx, { name: "bash" }, successResult(), {
    kind: "accept",
    content: [{ type: "text", text: "downstream" }],
  });
  assert.equal(result.kind, "accept", "ask 应委托");
});

test("H3.4 失败结果走同一挂载点，isError 透传给 judge", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();

  const seen = [];
  postToolUse.mountPostToolUse(ctx, {
    judge: async (input) => {
      seen.push({ isError: input.isError, errorMessage: input.errorMessage });
      return { kind: "deny", reason: "failure intercepted" };
    },
  });

  // 成功
  await runWaterfall(ctx, { name: "bash" }, successResult());
  // 失败
  await runWaterfall(ctx, { name: "bash" }, failureResult("command not found"));

  assert.deepEqual(seen, [
    { isError: false, errorMessage: undefined },
    { isError: true, errorMessage: "command not found" },
  ]);
});

test("H3.4 失败结果也能被 block（PostToolUseFailure 的阻断）", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();
  postToolUse.mountPostToolUse(ctx, {
    judge: async () => ({ kind: "deny", reason: "hide failure detail" }),
  });

  const result = await runWaterfall(ctx, { name: "bash" }, failureResult("secret leaked"));
  assert.equal(result.kind, "block");
  assert.equal(result.feedback[0].text, "hide failure detail");
});

test("H3.3 判定输入映射：toolName / toolUseId / resultContent / signal", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();

  let seen;
  postToolUse.mountPostToolUse(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "allow" };
    },
  });

  const signal = new AbortController().signal;
  await runWaterfall(
    ctx,
    { name: "write_file", callId: "call-9", signal },
    { isError: false, content: [{ type: "text", text: "written" }] },
  );

  assert.equal(seen.toolName, "write_file");
  assert.equal(seen.toolUseId, "call-9");
  assert.deepEqual(seen.resultContent, [{ type: "text", text: "written" }]);
  assert.equal(seen.signal, signal);
});

test("H3.3 本包 block 后下游不执行", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();

  const order = [];
  postToolUse.mountPostToolUse(ctx, {
    judge: async () => {
      order.push("plugin-hook");
      return { kind: "deny", reason: "blocked" };
    },
  });
  ctx.on("tools/post-execute", async (_exec, _result, next) => {
    order.push("downstream");
    return await next();
  });

  await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.deepEqual(order, ["plugin-hook"], "block 后下游不应执行");
});

test("H1.3 卸载后监听器注销", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = postToolUse.mountPostToolUse(ctx, {
    judge: async () => {
      calls += 1;
      return { kind: "allow" };
    },
  });

  await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.equal(calls, 1);

  dispose();
  await runWaterfall(ctx, { name: "bash" }, successResult());
  assert.equal(calls, 1);
});

test("H3.3 result 不可原地修改（deep-frozen 约束，靠返回新决策改变结果）", async () => {
  const { postToolUse } = await loadPlugin();
  const ctx = new Context();

  // 冻结的 result：本包不尝试修改它，而是返回新决策
  const frozen = Object.freeze({
    isError: false,
    value: Object.freeze({ ok: true }),
    content: Object.freeze([{ type: "text", text: "done" }]),
  });
  postToolUse.mountPostToolUse(ctx, {
    judge: async () => ({ kind: "deny", reason: "replaced" }),
  });

  const result = await ctx.waterfall("tools/post-execute", { name: "bash" }, frozen, async () => ({
    kind: "accept",
  }));
  assert.equal(result.kind, "block", "靠返回决策替换，而不是改 frozen result");
});
