// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-trust-evaluation 的契约测试（B12 的 4 条规格）。
//
// ⚠️ 这是**安全判定**：判定顺序不能错。
// 所以测试的重点是「顺序」—— 每条规则都要验证「前面的规则不成立时才生效」。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-trust-evaluation.ts");
}

const USER_DECIDES = { mode: "user_decides", policyRevision: "p1" };
const ALLOW_TRUSTED = { mode: "allow_trusted_only", policyRevision: "p2" };
const DENY = { mode: "deny", policyRevision: "p3" };

function entry(overrides = {}) {
  return {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-current",
    event: "PreToolUse",
    sourcePath: "/repo/.agents/hooks.yaml",
    discoveryOrder: 2,
    matcher: "bash",
    matcherIndex: 0,
    hookIndex: 0,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    entry: entry(),
    policy: USER_DECIDES,
    storeStatus: "ok",
    records: [],
    revokedKeys: new Set(),
    hasMatchingRecord: false,
    isRevoked: false,
    ...overrides,
  };
}

// ── 7 条判定顺序 ────────────────────────────────────────────

test("B12 规则 1：策略 deny → blocked_policy（即使有匹配记录）", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ policy: DENY, hasMatchingRecord: true })),
    "blocked_policy",
    "deny 优先于「已信任」",
  );
});

test("B12 规则 2：store corrupt → blocked_untrusted（即使有匹配记录）", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ storeStatus: "corrupt", hasMatchingRecord: true })),
    "blocked_untrusted",
    "corrupt 优先于「已信任」",
  );
});

test("B12 规则 2 优先于规则 3：corrupt 时 allow_trusted_only 也报 blocked_untrusted", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ policy: ALLOW_TRUSTED, storeStatus: "corrupt" })),
    "blocked_untrusted",
  );
});

test("B12 规则 3：allow_trusted_only 且无匹配记录 → blocked_policy", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ policy: ALLOW_TRUSTED, hasMatchingRecord: false })),
    "blocked_policy",
  );
});

test("B12 规则 3 不阻止：allow_trusted_only 且有匹配记录 → trusted_persistent", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ policy: ALLOW_TRUSTED, hasMatchingRecord: true })),
    "trusted_persistent",
  );
});

test("B12 规则 4：有匹配持久记录 → trusted_persistent", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(evaluateTrustState(input({ hasMatchingRecord: true })), "trusted_persistent");
});

test("B12 规则 4 优先于规则 5：有匹配记录时即使 isRevoked 也报 trusted_persistent", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ hasMatchingRecord: true, isRevoked: true })),
    "trusted_persistent",
    "已持久记录优先于撤销标记（协调者在写入记录时已清除撤销标记）",
  );
});

test("B12 规则 5：key 在撤销集合 → revoked", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(evaluateTrustState(input({ isRevoked: true })), "revoked");
});

test("B12 规则 5 优先于规则 6：撤销优先于「同槽位旧记录」", async () => {
  const { evaluateTrustState } = await loadPlugin();
  const staleRecord = {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-old",
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherAtGrant: "bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };
  assert.equal(
    evaluateTrustState(input({ isRevoked: true, records: [staleRecord] })),
    "revoked",
    "撤销优先于 stale_digest",
  );
});

test("B12 规则 6：存在「同槽位」旧记录 → stale_digest", async () => {
  const { evaluateTrustState } = await loadPlugin();
  const staleRecord = {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-old",
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherAtGrant: "bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };
  assert.equal(evaluateTrustState(input({ records: [staleRecord] })), "stale_digest");
});

test("B12 规则 7：其他 → pending_trust", async () => {
  const { evaluateTrustState } = await loadPlugin();
  assert.equal(evaluateTrustState(input()), "pending_trust");
});

// ── 「同槽位」判定的细节（B12.1）────────────────────────────

test("B12.1 同槽位：digest 相同不算「同槽位」", async () => {
  const { isSameSlot } = await loadPlugin();
  const record = {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-current", // 与当前相同
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherAtGrant: "bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };
  assert.equal(isSameSlot(record, entry()), false, "digest 相同不是「同槽位的旧记录」");
});

test("B12.1 同槽位：不同 workspace 不算", async () => {
  const { isSameSlot } = await loadPlugin();
  const record = {
    workspaceIdentity: "ws-2",
    hookDeclarationDigest: "digest-old",
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherAtGrant: "bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };
  assert.equal(isSameSlot(record, entry()), false);
});

test("B12.1 同槽位：缺字段的记录不参与判断", async () => {
  const { isSameSlot } = await loadPlugin();
  for (const missing of [
    "eventAtGrant",
    "sourcePathAtGrant",
    "sourceDiscoveryOrderAtGrant",
    "matcherIndexAtGrant",
    "hookIndexAtGrant",
  ]) {
    const record = {
      workspaceIdentity: "ws-1",
      hookDeclarationDigest: "digest-old",
      eventAtGrant: "PreToolUse",
      sourcePathAtGrant: "/repo/.agents/hooks.yaml",
      sourceDiscoveryOrderAtGrant: 2,
      matcherAtGrant: "bash",
      matcherIndexAtGrant: 0,
      hookIndexAtGrant: 0,
    };
    delete record[missing];
    assert.equal(isSameSlot(record, entry()), false, `缺 ${missing} 应不参与判断`);
  }
});

test("B12.1 同槽位：任一字段不等就不算", async () => {
  const { isSameSlot } = await loadPlugin();
  const base = {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-old",
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherAtGrant: "bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };

  for (const [field, value] of [
    ["eventAtGrant", "PostToolUse"],
    ["sourcePathAtGrant", "/other.yaml"],
    ["sourceDiscoveryOrderAtGrant", 99],
    ["matcherAtGrant", "write"],
    ["matcherIndexAtGrant", 1],
    ["hookIndexAtGrant", 1],
  ]) {
    assert.equal(
      isSameSlot({ ...base, [field]: value }, entry()),
      false,
      `${field} 不等应不算同槽位`,
    );
  }
});

test("B12.1 同槽位：matcher 都为 undefined 视为相等", async () => {
  const { isSameSlot } = await loadPlugin();
  const record = {
    workspaceIdentity: "ws-1",
    hookDeclarationDigest: "digest-old",
    eventAtGrant: "PreToolUse",
    sourcePathAtGrant: "/repo/.agents/hooks.yaml",
    sourceDiscoveryOrderAtGrant: 2,
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
  };
  const entryWithoutMatcher = entry({ matcher: undefined });
  assert.equal(isSameSlot(record, entryWithoutMatcher), true);
});

// ── 准入映射（B12.2）─────────────────────────────────────

test("B12.2 只有 trusted_persistent 是 admitted", async () => {
  const { admissionClassOf } = await loadPlugin();
  assert.equal(admissionClassOf("trusted_persistent"), "admitted");

  for (const state of [
    "blocked_policy",
    "blocked_untrusted",
    "revoked",
    "stale_digest",
    "pending_trust",
  ]) {
    assert.equal(admissionClassOf(state), "blocked", `${state} 应为 blocked`);
  }
});

// ── effectiveRunnable 公式（B12.3）────────────────────────

test("B12.3 effectiveRunnable 需要 admitted + configuredEnabled + 非 deny", async () => {
  const { evaluateEffectiveState } = await loadPlugin();

  const base = {
    ...input({ hasMatchingRecord: true }),
    reviewItemId: "item-1",
    sourceRootEnabled: true,
    declarationEnabled: true,
    runtimeHooksEnabled: true,
    configuredEnabled: true,
    editable: false,
    bundleDigest: "bundle-1",
    sourcePaths: ["/repo/.agents/hooks.yaml"],
  };

  // 全部满足 → runnable
  assert.equal(evaluateEffectiveState(base).effectiveRunnable, true);

  // configuredEnabled = false → 不可运行
  assert.equal(
    evaluateEffectiveState({ ...base, configuredEnabled: false }).effectiveRunnable,
    false,
  );

  // 未信任 → 不可运行
  assert.equal(
    evaluateEffectiveState({ ...base, hasMatchingRecord: false }).effectiveRunnable,
    false,
  );

  // deny → 不可运行
  assert.equal(evaluateEffectiveState({ ...base, policy: DENY }).effectiveRunnable, false);
});

test("B12.2 输出字段完整（13 个字段）", async () => {
  const { evaluateEffectiveState } = await loadPlugin();
  const state = evaluateEffectiveState({
    ...input({ hasMatchingRecord: true }),
    reviewItemId: "item-1",
    sourceRootEnabled: true,
    declarationEnabled: true,
    runtimeHooksEnabled: true,
    configuredEnabled: true,
    editable: false,
    bundleDigest: "bundle-1",
    sourcePaths: ["/p"],
  });

  for (const field of [
    "reviewItemId",
    "sourceRootEnabled",
    "declarationEnabled",
    "runtimeHooksEnabled",
    "configuredEnabled",
    "editable",
    "trustState",
    "admissionClass",
    "effectiveRunnable",
    "workspaceIdentity",
    "bundleDigest",
    "hookDeclarationDigest",
    "sourcePaths",
  ]) {
    assert.ok(field in state, `缺字段 ${field}`);
  }
});

test("B12.4 纯函数：不修改入参", async () => {
  const { evaluateTrustState } = await loadPlugin();
  const args = input({ records: [] });
  const before = JSON.stringify({
    entry: args.entry,
    records: args.records,
    policy: args.policy,
  });

  evaluateTrustState(args);

  assert.equal(
    JSON.stringify({ entry: args.entry, records: args.records, policy: args.policy }),
    before,
    "不应修改入参",
  );
});

// ── fail-closed（B11.8）──────────────────────────────────

test("B11.8 fail-closed 策略是 deny + 特定 revision", async () => {
  const { FAIL_CLOSED_POLICY, FAIL_CLOSED_REASON_CODE } = await loadPlugin();

  assert.equal(FAIL_CLOSED_POLICY.mode, "deny");
  assert.equal(FAIL_CLOSED_POLICY.policyRevision, "provider-error:fail-closed");
  assert.equal(Object.isFrozen(FAIL_CLOSED_POLICY), true);
  assert.equal(FAIL_CLOSED_REASON_CODE, "workspace_hooks_blocked_by_policy");
});

test("B11.8 fail-closed 时 trustState 是 blocked_policy", async () => {
  const { evaluateTrustState, FAIL_CLOSED_POLICY } = await loadPlugin();
  assert.equal(
    evaluateTrustState(input({ policy: FAIL_CLOSED_POLICY, hasMatchingRecord: true })),
    "blocked_policy",
    "fail-closed 必须阻止（即使有匹配记录）",
  );
});
