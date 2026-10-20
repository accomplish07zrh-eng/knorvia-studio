// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B9/B10：审批交互的桥接与 **fail closed** 安全底线。
//
// B10 是权限模型的安全底线：审批拿不到应答时必须**拒绝**，不能默认放行。
// 因此这里断言的四种「拿不到有效同意」的路径都必须落到 `unavailable` 或 `rejected`，
// 绝不允许出现 `allowed-once`。
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { repoRoot } from "./entry.mjs";

/** 包内导出的审批模块源码入口。 */
const APPROVAL_MODULE = join(
  repoRoot,
  "apps/cli/packages/bootstrap/src/kernel-bridge/turn-approval.ts",
);

/** 包内导出的引擎模块源码入口（关闭路径断言要用真引擎）。 */
const ENGINE_MODULE = join(
  repoRoot,
  "apps/cli/packages/bootstrap/src/kernel-bridge/bridge-engine.ts",
);

/**
 * 载入审批模块。
 *
 * @returns 该模块的命名空间。
 */
async function loadApprovalModule() {
  return import(pathToFileURL(APPROVAL_MODULE).href);
}

/**
 * 载入桥引擎模块。
 *
 * @returns 该模块的命名空间。
 */
async function loadEngineModule() {
  return import(pathToFileURL(ENGINE_MODULE).href);
}

/**
 * 造一个审批请求的入参。
 *
 * @param overrides - 要覆盖的字段。
 * @returns 完整的请求参数。
 */
function approvalRequest(overrides = {}) {
  const controller = new AbortController();
  return {
    toolName: "probe-tool",
    toolCallId: "call-1",
    reason: "probe reason",
    signal: controller.signal,
    ...overrides,
  };
}

test("B10 Host 通道缺席时审批 fail closed（不授权）", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  // 通道缺席 = legacy 的 LegacyHostChannel 还没接上：安全侧唯一正确的答案是「不批准」。
  const outcome = await requestTurnApproval(approvalRequest());
  assert.equal(outcome, "unavailable", `通道缺席必须 unavailable；实际=${JSON.stringify(outcome)}`);
  assert.notEqual(outcome, "allowed-once", "通道缺席绝不得授权");
});

test("B10 通道抛错时 fail closed（不授权）", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  const outcome = await requestTurnApproval(
    approvalRequest({
      channel: {
        async request() {
          throw new Error("channel closed");
        },
      },
    }),
  );
  assert.equal(outcome, "unavailable", "通道失败必须 unavailable");
});

test("B10 应答非法时 fail closed（不授权）", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  // 返回一个形状非法的应答：解析必须失败 → 收敛为 unavailable。
  const outcome = await requestTurnApproval(
    approvalRequest({
      channel: {
        async request() {
          return "yes";
        },
      },
    }),
  );
  assert.equal(outcome, "unavailable", "非法应答必须 unavailable");
});

test("B10 取消信号已触发时不发请求、直接 fail closed", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const outcome = await requestTurnApproval(
    approvalRequest({
      signal: controller.signal,
      channel: {
        async request() {
          called = true;
          return { action: "accept" };
        },
      },
    }),
  );
  assert.equal(outcome, "unavailable", "已取消的请求必须 unavailable");
  assert.equal(called, false, "已取消时不得再向 Host 发请求");
});

test("B9 明确 accept 才授权；decline/cancel 是拒绝", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  const accept = await requestTurnApproval(
    approvalRequest({
      channel: {
        async request() {
          return { action: "accept" };
        },
      },
    }),
  );
  assert.equal(accept, "allowed-once", "明确 accept 必须授权");
  for (const action of ["decline", "cancel"]) {
    const outcome = await requestTurnApproval(
      approvalRequest({
        channel: {
          async request() {
            return { action };
          },
        },
      }),
    );
    assert.equal(outcome, "rejected", `${action} 必须判为 rejected`);
  }
});

test("B9 认不出的 optionId 不授权（宁可多拒）", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  // 冻结面的审批选项 `kind` 只有 allowOnce / allowAlways / deny / custom；
  // 这里用**不属于同意类**的 id，必须按拒绝处理。
  for (const optionId of ["deny", "custom", "something-else", "allow-never"]) {
    const outcome = await requestTurnApproval(
      approvalRequest({
        channel: {
          async request() {
            return { optionId };
          },
        },
      }),
    );
    assert.equal(outcome, "rejected", `optionId=${optionId} 不表达同意时必须 rejected`);
  }
});

test("B9 表达同意的 optionId 授权（allowOnce / allowAlways / fullAccess）", async () => {
  const { requestTurnApproval } = await loadApprovalModule();
  // 连字符与驼峰两种写法都要认（`permissionOptionSchema.kind` 是驼峰，协议里也可能带连字符）。
  for (const optionId of ["allowOnce", "allow-once", "allowAlways", "fullAccess"]) {
    const outcome = await requestTurnApproval(
      approvalRequest({
        channel: {
          async request() {
            return { optionId };
          },
        },
      }),
    );
    assert.equal(outcome, "allowed-once", `optionId=${optionId} 是同意类，必须授权`);
  }
});

test("B9 resolveInteraction 先到先得，晚到 noop", async () => {
  const { TurnApprovalRegistry } = await loadApprovalModule();
  const registry = new TurnApprovalRegistry();
  const outcomes = [];
  const unregister = registry.register("interaction-1", (outcome) => outcomes.push(outcome));
  assert.equal(registry.size, 1, "登记后应有一个未决请求");

  const first = registry.settle("interaction-1", { action: "accept" });
  assert.equal(first, true, "首次应答必须生效");
  const second = registry.settle("interaction-1", { action: "decline" });
  assert.equal(second, false, "晚到应答必须是 noop");
  assert.deepEqual(outcomes, ["allowed-once"], "只有首次决定生效，且不得被后续改写");
  assert.equal(registry.size, 0, "闭合后不应残留");
  unregister();
});

test("B10 回合结束时剩余未决请求全部 fail closed", async () => {
  const { TurnApprovalRegistry } = await loadApprovalModule();
  const registry = new TurnApprovalRegistry();
  const outcomes = [];
  registry.register("interaction-a", (outcome) => outcomes.push(outcome));
  registry.register("interaction-b", (outcome) => outcomes.push(outcome));
  registry.failAllPending();
  assert.deepEqual(
    outcomes,
    ["unavailable", "unavailable"],
    "回合结束时未决请求必须全部 unavailable，不得默认放行",
  );
  assert.equal(registry.size, 0, "failAllPending 后不得残留");
});

test("B10 进程关闭时引擎把未决审批全部结算为 unavailable（不留永久挂起的反向请求）", async () => {
  // 场景：进程在回合中途被终止（EOF / 信号）。若关闭路径不结算未决审批，
  // Host 侧会挂着一个永远等不到应答的反向请求。
  const { BridgeEngine } = await loadEngineModule();
  const root = await mkdtemp(join(tmpdir(), "kernel-bridge-02-shutdown-"));
  const engine = new BridgeEngine({
    context: { sessions: { create: () => ({ header: {} }) }, on: () => () => {} },
    writeFrame() {},
  });
  const outcomes = [];
  engine.approvals.register("interaction-live", (outcome) => outcomes.push(outcome));
  assert.equal(engine.approvals.size, 1, "关闭前应有一个未决审批");
  try {
    await engine.dispose();
    assert.deepEqual(
      outcomes,
      ["unavailable"],
      "dispose() 必须把未决审批结算为 unavailable（fail closed）",
    );
    assert.equal(engine.approvals.size, 0, "关闭后不得残留未决审批");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
