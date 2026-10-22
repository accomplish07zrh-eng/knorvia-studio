// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// PermissionRequest 挂载点的契约测试（H1 + H3.2）。
//
// 全部走公开入口：本包 `permission-request.ts` 的导出 + `verdict.ts` 的导出，
// 用真实 cordis `Context` 触发 DSH 的 `approval/request` waterfall。
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";

async function loadPlugin() {
  const [permissionRequest, verdict] = await Promise.all([
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/permission-request.ts"),
    import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/verdict.ts"),
  ]);
  return { permissionRequest, verdict };
}

/** 调用一次 approval waterfall，返回 outcome。 */
async function runWaterfall(ctx, req, downstream = "unavailable") {
  return await ctx.waterfall("approval/request", req, async () => downstream);
}

test("H3.2 allow → allowed-once（DSH 无「永久允许」语义）", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();
  permissionRequest.mountPermissionRequest(ctx, { judge: async () => ({ kind: "allow" }) });

  const result = await runWaterfall(ctx, { toolName: "bash" });
  assert.equal(result, "allowed-once");
});

test("H3.2 deny → rejected", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async () => ({ kind: "deny", reason: "not allowed" }),
  });

  const result = await runWaterfall(ctx, { toolName: "bash" });
  assert.equal(result, "rejected");
});

test("H3.2 ask → 委托（本事件本身就是请求审批，返回 ask 会造成循环）", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async () => ({ kind: "ask", reason: "needs approval" }),
  });

  const result = await runWaterfall(ctx, { toolName: "bash" }, "allowed-once");
  assert.equal(result, "allowed-once", "ask 应委托给下游应答者");
});

test("H3.2 无意见 → 委托，拿到下游 outcome", async () => {
  const { permissionRequest, verdict } = await loadPlugin();
  const ctx = new Context();
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async () => verdict.NO_OPINION,
  });

  const result = await runWaterfall(ctx, { toolName: "bash" }, "rejected");
  assert.equal(result, "rejected", "无意见应委托");
});

test("H3.2 判定输入映射：toolName / toolUseId / reason / signal 取自 DSH 载荷", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();

  let seen;
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "deny", reason: "recorded" };
    },
  });

  const signal = new AbortController().signal;
  await runWaterfall(ctx, {
    toolName: "write_file",
    callId: "call-7",
    reason: "file outside workspace",
    signal,
  });

  assert.equal(seen.toolName, "write_file");
  assert.equal(seen.toolUseId, "call-7");
  assert.equal(seen.reason, "file outside workspace");
  assert.equal(seen.signal, signal, "signal 必须原样透传");
});

test("H3.2 可选字段缺失时不报错（callId / reason / signal 都可缺）", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();

  let seen;
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async (input) => {
      seen = input;
      return { kind: "deny", reason: "recorded" };
    },
  });

  await runWaterfall(ctx, { toolName: "bash" });
  assert.equal(seen.toolName, "bash");
  assert.equal(seen.toolUseId, undefined);
  assert.equal(seen.reason, undefined);
  assert.equal(seen.signal, undefined);
});

test("H3.2 认领后下游不执行（不调 next）", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();

  const order = [];
  permissionRequest.mountPermissionRequest(ctx, {
    judge: async () => {
      order.push("plugin-hook");
      return { kind: "deny", reason: "blocked" };
    },
  });
  ctx.on("approval/request", async (_req, next) => {
    order.push("downstream");
    return await next();
  });

  const result = await runWaterfall(ctx, { toolName: "bash" });
  assert.deepEqual(order, ["plugin-hook"], "认领后下游不应执行");
  assert.equal(result, "rejected");
});

test("H1.3 卸载后监听器注销", async () => {
  const { permissionRequest } = await loadPlugin();
  const ctx = new Context();

  let calls = 0;
  const dispose = permissionRequest.mountPermissionRequest(ctx, {
    judge: async () => {
      calls += 1;
      return { kind: "deny", reason: "blocked" };
    },
  });

  await runWaterfall(ctx, { toolName: "bash" });
  assert.equal(calls, 1);

  dispose();
  await runWaterfall(ctx, { toolName: "bash" });
  assert.equal(calls, 1, "卸载后不应再调用 judge");
});
