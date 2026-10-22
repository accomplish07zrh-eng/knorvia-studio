// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PreToolUse 挂载点的契约测试（H1 + H3.1 + H3.8）。
//
// 全部走公开入口：本包 `pre-tool-use.ts` 的导出 + `verdict.ts` 的导出，
// 用真实的 cordis `Context` 触发 DSH 的 `tools/pre-execute` waterfall。
// 不 import `bootstrap/src/kernel/**`（那是 kernel-dsh-builtins 的范围）。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

/** 加载本包模块（测试在 specs/ 下，按仓库路径解析源码入口）。 */
async function loadPlugin() {
  const [preToolUse, verdict] = await Promise.all([
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/pre-tool-use.ts"),
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/verdict.ts"),
  ]);
  return { preToolUse, verdict };
}

/** 构造一次工具调用的最小载荷。 */
function makeExec(overrides = {}) {
  return {
    callId: "call-1",
    name: "bash",
    arguments: { command: "echo hi" },
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** 调用一次 waterfall，返回决策。 */
async function runWaterfall(ctx, exec) {
  return await ctx.waterfall("tools/pre-execute", exec, async () => ({ kind: "allow" }));
}

test("H3.1 无意见时委托：调 next()，决策来自下游", async () => {
  const { preToolUse, verdict } = await loadPlugin();
  const ctx = new Context();
  preToolUse.mountPreToolUse(ctx, { judge: async () => verdict.NO_OPINION });

  const result = await runWaterfall(ctx, makeExec());
  assert.deepEqual(result, { kind: "allow" }, "无意见应委托，得到下游的 allow");
});

test("H3.1 deny 时阻断并带 reason（DSH 类型要求）", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();
  preToolUse.mountPreToolUse(ctx, {
    judge: async () => ({ kind: "deny", reason: "destructive command blocked" }),
  });

  const result = await runWaterfall(ctx, makeExec());
  assert.equal(result.kind, "deny");
  assert.equal(result.reason, "destructive command blocked");
});

test("H3.1 ask 时要求审批", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();
  preToolUse.mountPreToolUse(ctx, {
    judge: async () => ({ kind: "ask", reason: "needs approval" }),
  });

  const result = await runWaterfall(ctx, makeExec());
  assert.equal(result.kind, "ask");
  assert.equal(result.reason, "needs approval");
});

test("H3.1 allow 时显式放行", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();
  preToolUse.mountPreToolUse(ctx, { judge: async () => ({ kind: "allow" }) });

  const result = await runWaterfall(ctx, makeExec());
  assert.equal(result.kind, "allow");
});

test("H3.1 判定输入映射：toolName / toolInput / toolUseId 取自 DSH 载荷", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();

  let seen;
  preToolUse.mountPreToolUse(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "deny", reason: "recorded" };
    },
  });

  const signal = new AbortController().signal;
  await runWaterfall(
    ctx,
    makeExec({ callId: "call-42", name: "write_file", arguments: { path: "/tmp/a" }, signal }),
  );

  assert.equal(seen.toolName, "write_file");
  assert.deepEqual(seen.toolInput, { path: "/tmp/a" });
  assert.equal(seen.toolUseId, "call-42");
  assert.equal(seen.signal, signal, "signal 必须原样透传（behavior.md §2.4 要求观察它）");
});

test("H3.8 短路：本包 deny 后，后续监听器不再执行", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();

  const order = [];
  preToolUse.mountPreToolUse(ctx, {
    judge: async () => {
      order.push("plugin-hook");
      return { kind: "deny", reason: "blocked" };
    },
  });
  ctx.on("tools/pre-execute", async (_exec, next) => {
    order.push("downstream");
    return await next();
  });

  const result = await runWaterfall(ctx, makeExec());
  assert.deepEqual(order, ["plugin-hook"], "本包 deny 后下游不应执行");
  assert.equal(result.kind, "deny");
});

test("H3.8 委托时不短路：下游监听器正常执行", async () => {
  const { preToolUse, verdict } = await loadPlugin();
  const ctx = new Context();

  const order = [];
  preToolUse.mountPreToolUse(ctx, {
    judge: async () => {
      order.push("plugin-hook");
      return verdict.NO_OPINION;
    },
  });
  ctx.on("tools/pre-execute", async (_exec, next) => {
    order.push("downstream");
    return await next();
  });

  await runWaterfall(ctx, makeExec());
  assert.deepEqual(order, ["plugin-hook", "downstream"], "无意见时应委托给下游");
});

test("H1.3 卸载后监听器注销，不再触发", async () => {
  const { preToolUse } = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = preToolUse.mountPreToolUse(ctx, {
    judge: async () => {
      calls += 1;
      return { kind: "deny", reason: "blocked" };
    },
  });

  await runWaterfall(ctx, makeExec());
  assert.equal(calls, 1);

  dispose();
  await runWaterfall(ctx, makeExec());
  assert.equal(calls, 1, "卸载后不应再调用 judge");
});

test("H2 裁决映射：verdictFromPermissionDecision 的三种输入", async () => {
  const { verdict } = await loadPlugin();

  assert.deepEqual(verdict.verdictFromPermissionDecision("deny", "why"), {
    kind: "deny",
    reason: "why",
  });
  // 用户没给 reason 时用固定文案（DSH 的 deny 必须有 reason）
  assert.deepEqual(verdict.verdictFromPermissionDecision("deny", undefined), {
    kind: "deny",
    reason: "denied by hook",
  });
  assert.deepEqual(verdict.verdictFromPermissionDecision("ask", "why"), {
    kind: "ask",
    reason: "why",
  });
  assert.deepEqual(verdict.verdictFromPermissionDecision("allow", undefined), { kind: "allow" });
  // 没有 permissionDecision → 无意见
  assert.deepEqual(verdict.verdictFromPermissionDecision(undefined, undefined), {
    kind: "no-opinion",
  });
});

test("H1 事件名过滤：只认 7 种，其余返回 false", async () => {
  const { verdict } = await loadPlugin();

  for (const name of [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
  ]) {
    assert.equal(verdict.isManagedHookEvent(name), true, `${name} 应被识别`);
  }
  for (const name of ["PreToolUseTypo", "preToolUse", "", "Unknown"]) {
    assert.equal(verdict.isManagedHookEvent(name), false, `${name} 不应被识别`);
  }
});
