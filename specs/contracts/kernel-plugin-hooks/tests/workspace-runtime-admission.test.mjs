// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-runtime-admission 的契约测试（B14 的 8 条规格）。
//
// ⚠️ 重点：B14.3 的 **9 条判定顺序**（第一条命中即用）——
// 每条「优先于」关系都要独立测试。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-runtime-admission.ts");
}

function item(overrides = {}) {
  return {
    reviewItemId: "item-a",
    hookDeclarationDigest: "digest-a",
    configuredEnabled: true,
    admissionClass: "admitted",
    trustState: "trusted_persistent",
    effectiveRunnable: true,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    workspaceIdentity: "ws-1",
    bundleDigest: "bundle-1",
    items: [item()],
    ...overrides,
  };
}

function makeTelemetry() {
  const events = [];
  return {
    events,
    telemetry: { report: (event, reasonCode, key) => events.push({ event, reasonCode, key }) },
  };
}

test("B14.1 构造时索引快照；默认 enabled = true", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });

  assert.deepEqual(admission.getCurrentSnapshot(), snapshot());
});

test("B14.2 activate：signal 已 abort → 立即抛错", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  const controller = new AbortController();
  controller.abort(new Error("aborted by user"));

  let caught;
  try {
    admission.activate("test", controller.signal);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.message, "aborted by user");
});

test("B14.2 enabled === false：telemetry 一次 + 回调 pendingCount 0", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const { events, telemetry } = makeTelemetry();
  const states = [];

  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    enabled: false,
    telemetry,
    onState: (state) => states.push(state),
  });

  admission.activate("test");

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "workspace_hook.feature_disabled");
  assert.equal(states.length, 1);
  assert.equal(states[0].pendingCount, 0);
});

test("B14.2 activate 正常：回调 admission state", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const states = [];
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    onState: (state) => states.push(state),
  });

  admission.activate("test");

  assert.equal(states.length, 1);
  assert.equal(states[0].bundleDigest, "bundle-1");
  assert.equal(states[0].workspaceIdentity, "ws-1");
});

test("B14.7 pendingCount 只数「configuredEnabled 且 pending_trust」", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const states = [];
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({ reviewItemId: "a", trustState: "pending_trust", admissionClass: "blocked" }),
        item({
          reviewItemId: "b",
          trustState: "pending_trust",
          admissionClass: "blocked",
          configuredEnabled: false,
        }),
        item({ reviewItemId: "c", trustState: "trusted_persistent" }),
      ],
    }),
    onState: (state) => states.push(state),
  });

  admission.activate("test");
  assert.equal(states[0].pendingCount, 1, "只有 a 计入（b 未启用、c 已信任）");
});

// ── B14.3 的 9 条判定顺序 ──────────────────────────────

test("B14.3 规则 1：bundleDigest 不匹配 → snapshot_mismatch（优先于一切）", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    bundleDigest: "other-bundle",
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "workspace_hooks_snapshot_mismatch");
});

test("B14.3 规则 1：索引 digest 不一致 → snapshot_mismatch", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "wrong-digest",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_snapshot_mismatch");
});

test("B14.3 规则 2：已 invalidate → 拒绝该 reasonCode（优先于未激活）", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });

  admission.invalidate("workspace_hooks_trust_store_corrupt");

  // 未 activate，但 invalidate 优先
  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_trust_store_corrupt");
});

test("B14.3 规则 3：未 activate → pending_trust", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_pending_trust");
});

test("B14.3 规则 4：enabled === false → feature_disabled（优先于 bootstrapFailed）", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const { telemetry } = makeTelemetry();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    enabled: false,
    telemetry,
  });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_feature_disabled");
});

test("B14.3 规则 5：bootstrapFailed → trust_store_corrupt", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    reevaluate: () => {
      throw new Error("evaluation failed");
    },
  });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_trust_store_corrupt");
});

test("B14.3 规则 6：revision 不一致 → 重新评估并重发 state（pendingCount 0 也发）", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const states = [];
  let reevaluateCount = 0;
  let counter = 0;

  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    reevaluate: () => {
      reevaluateCount += 1;
      return [item()];
    },
    // 注入 counter 读取点（真实场景由 B11 协调者提供）
    readSecurityCounter: () => counter,
    onState: (state) => states.push(state),
  });
  admission.activate("test");
  const afterActivate = reevaluateCount;
  const statesAfterActivate = states.length;

  // 让 counter 前进 → 客户端持有的 counter 过期 → 触发重评估
  counter = 5;
  admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
    securityCounter: 0, // 客户端还持有旧的 0
  });

  assert.ok(reevaluateCount > afterActivate, "应重新评估");
  assert.ok(states.length > statesAfterActivate, "应重发 state（即使 pendingCount 为 0）");
});

test("B14.3 规则 6：counter 一致时不重评估", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  let reevaluateCount = 0;
  let counter = 3;

  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot(),
    reevaluate: () => {
      reevaluateCount += 1;
      return [item()];
    },
    readSecurityCounter: () => counter,
  });
  admission.activate("test");
  const afterActivate = reevaluateCount;

  admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
    securityCounter: 3, // 与当前一致
  });

  assert.equal(reevaluateCount, afterActivate, "counter 一致不应重评估");
});

test("B14.3 规则 7：找不到 item → snapshot_mismatch", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-x",
    reviewItemId: "item-unknown",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_snapshot_mismatch");
});

test("B14.3 规则 8：effectiveRunnable → allowed", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reasonCode, undefined);
});

test("B14.3 规则 9：不可运行 → reasonCode = item.reasonCode ?? blocked_untrusted", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({ effectiveRunnable: false, trustState: "pending_trust", admissionClass: "blocked" }),
      ],
    }),
  });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.allowed, false);
  assert.equal(
    decision.reasonCode,
    "workspace_hooks_blocked_untrusted",
    "无 item.reasonCode 时用兜底",
  );
});

test("B14.3 规则 9：item 带 reasonCode 时优先用它", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({
          effectiveRunnable: false,
          trustState: "stale_digest",
          admissionClass: "blocked",
          reasonCode: "workspace_hooks_stale_digest",
        }),
      ],
    }),
  });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.reasonCode, "workspace_hooks_stale_digest");
});

test("B14.3 规则 9：configuredEnabled === false → skipLifecycle: true", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({
          effectiveRunnable: false,
          configuredEnabled: false,
          trustState: "pending_trust",
          admissionClass: "blocked",
        }),
      ],
    }),
  });
  admission.activate("test");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.skipLifecycle, true);
});

// ── B14.4 replaceSnapshot ──────────────────────────────

test("B14.4 跨 workspace 替换 → 抛错且状态不变", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({ workspaceIdentity: "ws-1" }),
  });

  let caught;
  try {
    admission.replaceSnapshot(snapshot({ workspaceIdentity: "ws-2" }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.match(caught.message, /across workspaces/u);
  assert.equal(admission.getCurrentSnapshot().workspaceIdentity, "ws-1", "状态不应改变");
});

test("B14.4 同 workspace 替换 → 重建索引并清空失效标记", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.invalidate("some-reason");

  admission.replaceSnapshot(snapshot({ bundleDigest: "bundle-2" }));

  assert.equal(admission.getCurrentSnapshot().bundleDigest, "bundle-2");
  // 失效标记应被清除 → dispatch 不再按旧 reason 拒绝
  admission.activate("test");
  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.notEqual(decision.reasonCode, "some-reason", "失效标记应已清除");
});

// ── B14.5 invalidate ──────────────────────────────────

test("B14.5 invalidate 后 dispatch 一律按该原因拒绝", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: snapshot() });
  admission.activate("test");
  assert.equal(
    admission.evaluateDispatch({ hookDeclarationDigest: "digest-a", reviewItemId: "item-a" })
      .allowed,
    true,
  );

  admission.invalidate("workspace_hooks_store_corrupt");

  const decision = admission.evaluateDispatch({
    hookDeclarationDigest: "digest-a",
    reviewItemId: "item-a",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "workspace_hooks_store_corrupt");
});

// ── B14.8 telemetry 去重 ──────────────────────────────

test("B14.8 telemetry 去重：同一键只发一次", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const { events, telemetry } = makeTelemetry();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({ effectiveRunnable: false, trustState: "blocked_policy", admissionClass: "blocked" }),
      ],
    }),
    telemetry,
  });
  admission.activate("test");

  // 连续三次 dispatch，policy_blocked 只应上报一次
  for (let index = 0; index < 3; index += 1) {
    admission.evaluateDispatch({
      hookDeclarationDigest: "digest-a",
      reviewItemId: "item-a",
    });
  }

  const policyEvents = events.filter((e) => e.event === "workspace_hook.policy_blocked");
  assert.equal(policyEvents.length, 1, "同一键只发一次");
});

test("B14.8 telemetry 去重键包含 bundleDigest（不同 bundle 可各报一次）", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const { events, telemetry } = makeTelemetry();
  const admission = new WorkspaceHookRuntimeAdmission({
    snapshot: snapshot({
      items: [
        item({ effectiveRunnable: false, trustState: "blocked_policy", admissionClass: "blocked" }),
      ],
    }),
    telemetry,
  });
  admission.activate("test");

  admission.evaluateDispatch({ hookDeclarationDigest: "digest-a", reviewItemId: "item-a" });
  admission.replaceSnapshot(
    snapshot({
      bundleDigest: "bundle-2",
      items: [
        item({ effectiveRunnable: false, trustState: "blocked_policy", admissionClass: "blocked" }),
      ],
    }),
  );
  admission.evaluateDispatch({ hookDeclarationDigest: "digest-a", reviewItemId: "item-a" });

  const policyEvents = events.filter((e) => e.event === "workspace_hook.policy_blocked");
  assert.equal(policyEvents.length, 2, "不同 bundleDigest → 不同去重键");
});

// ── B14.6 ─────────────────────────────────────────────

test("B14.6 getCurrentSnapshot 返回当前快照引用", async () => {
  const { WorkspaceHookRuntimeAdmission } = await loadPlugin();
  const initial = snapshot();
  const admission = new WorkspaceHookRuntimeAdmission({ snapshot: initial });

  assert.equal(admission.getCurrentSnapshot(), initial, "应是同一引用");
});
