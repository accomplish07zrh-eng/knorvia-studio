// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B8：沙箱策略与审批执行点在位，且行为是 fail closed。
//
// 本包只挂载与配置两个执行点；五种权限模式到 DSH 策略的映射归 kernel-plugin-policy
// （known-differences D8）。这里断言的是执行点本身的可观察契约。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

/**
 * 起内核并把回调交给它；退出时释放内核与临时目录。
 *
 * @param callback - 收到 `{ ctx, workspace, host }` 的回调。
 * @returns 回调的返回值。
 */
async function withKernel(callback) {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-policy-"));
  const workspace = join(root, "ws");
  let host;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    return await callback({ ctx: host.context, workspace, host });
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责；这里只做清理。
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("B8 沙箱策略服务在位，默认模式是 workspace-write", async () => {
  await withKernel(async ({ ctx }) => {
    assert.ok(ctx.get("sandbox"), "B8 必须挂 dsh-sandbox-local（ctx.sandbox）");
    const policy = ctx.get("sandboxPolicy");
    assert.ok(policy, "B8 必须挂 dsh-sandbox-policy（ctx.sandboxPolicy）");
    assert.equal(policy.defaultMode, "workspace-write", "B8 默认模式必须与旧内核一致");
  });
});

test("B8 resolve() 返回启动 cwd 作为 workspace-write 边界", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const resolved = await ctx.get("sandboxPolicy").resolve({});
    assert.equal(resolved.mode, "workspace-write", "B8 resolve 的模式必须是 workspace-write");
    assert.equal(
      resolved.workspaceRoot,
      workspace,
      `B8 resolve 的边界必须是启动 cwd；实际=${resolved.workspaceRoot}`,
    );
    // 内核被宿主进程加载时 process.cwd() 是宿主目录；边界必须跟着会话走。
    assert.notEqual(
      resolved.workspaceRoot,
      process.cwd(),
      "B8 测试前提：启动 cwd 与 process.cwd() 必须不同，才能区分两者",
    );
  });
});

test("B8 审批服务在位且默认策略是 ask", async () => {
  await withKernel(async ({ ctx }) => {
    const approval = ctx.get("approval");
    assert.ok(approval, "B8 必须挂 dsh-user-approval（ctx.approval）");
    assert.equal(approval.config?.policy, "ask", "B8 审批默认策略必须是 ask");
  });
});

test("B8 无应答者时审批 fail closed：不得授权", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const handle = await ctx.get("agents").create({
      sessionId: "kernel-builtins-approval-probe",
      meta: { cwd: workspace },
    });
    const controller = new AbortController();
    const outcome = await ctx
      .get("approval")
      .request({
        agent: handle.agent,
        toolName: "probe",
        toolCallId: "probe-call",
        reason: "probe",
        signal: controller.signal,
      })
      .then(
        (value) => value,
        (error) => ({ threw: error.message }),
      );
    // 合法形态：没有开放回合时抛错（审计事件必须成对落在回合内），
    // 有回合但无应答者时返回 rejected/unavailable。任何一种都不得是授权。
    assert.notEqual(
      outcome,
      "allowed-once",
      `B8 无应答者时不得授权；实际=${JSON.stringify(outcome)}`,
    );
    assert.ok(
      outcome === "rejected" || outcome === "unavailable" || typeof outcome?.threw === "string",
      `B8 无应答者时必须 fail closed；实际=${JSON.stringify(outcome)}`,
    );
  });
});
