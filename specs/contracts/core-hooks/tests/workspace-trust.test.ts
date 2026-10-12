// SPDX-License-Identifier: Apache-2.0
// B10、B11、B12、B16：workspace Hook 策略、信任协调者、单条求值与信任记录。
import assert from "node:assert/strict";
import test from "node:test";
import { hooks } from "./entry.mjs";
import {
  BUNDLE_DIGEST,
  DECLARATION_DIGEST,
  WORKSPACE_IDENTITY,
  digest,
  makeSnapshot,
} from "../fixtures/builders.mjs";

const TRUSTED_POLICY = { mode: "user_decides", policyRevision: "fixture:v1" };

function makeRecord(overrides = {}) {
  return {
    workspaceIdentity: WORKSPACE_IDENTITY,
    hookDeclarationDigest: DECLARATION_DIGEST,
    digestAlgorithm: "sha256",
    decision: "trusted",
    grantedAt: "2026-01-01T00:00:00.000Z",
    bundleDigestAtGrant: BUNDLE_DIGEST,
    eventAtGrant: "PreToolUse",
    displayCommandAtGrant: "node hook.mjs",
    sourcePathAtGrant: ".knorvia-studio/config.json",
    sourceDiscoveryOrderAtGrant: 0,
    matcherAtGrant: "Bash",
    matcherIndexAtGrant: 0,
    hookIndexAtGrant: 0,
    ...overrides,
  };
}

test("B10 策略提供者：默认值、设置/清除通知、去重与非法输入", () => {
  const provider = new hooks.InMemoryWorkspaceHookPolicyProvider();
  assert.deepEqual(provider.getPolicy(WORKSPACE_IDENTITY), {
    mode: "user_decides",
    policyRevision: "builtin:user-decides:v1",
  });

  const seen = [];
  const unsubscribe = provider.subscribe((change) => seen.push(change));
  provider.setWorkspacePolicy(WORKSPACE_IDENTITY, TRUSTED_POLICY);
  provider.setWorkspacePolicy(WORKSPACE_IDENTITY, TRUSTED_POLICY);
  provider.setDefaultPolicy({ mode: "deny", reason: "locked", policyRevision: "fixture:v2" });
  provider.setDefaultPolicy({ mode: "deny", reason: "locked", policyRevision: "fixture:v2" });
  provider.clearWorkspacePolicy(WORKSPACE_IDENTITY);
  provider.clearWorkspacePolicy("workspace://fixture/never-seen");

  assert.deepEqual(seen, [
    { workspaceIdentity: WORKSPACE_IDENTITY, policy: TRUSTED_POLICY },
    { policy: { mode: "deny", reason: "locked", policyRevision: "fixture:v2" } },
    {
      workspaceIdentity: WORKSPACE_IDENTITY,
      policy: { mode: "deny", reason: "locked", policyRevision: "fixture:v2" },
    },
  ]);
  assert.equal(provider.getPolicy(WORKSPACE_IDENTITY).mode, "deny");
  assert.throws(() => provider.setWorkspacePolicy(WORKSPACE_IDENTITY, { mode: "nope" }));
  unsubscribe();
  provider.setDefaultPolicy(TRUSTED_POLICY);
  assert.equal(seen.length, 3, "取消订阅后不再收到通知");
});

test("B11 协调者：epoch 校验、revision 递增与校验", () => {
  assert.throws(() => new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "  " }));

  const provider = new hooks.InMemoryWorkspaceHookPolicyProvider();
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({
    coordinatorEpoch: "epoch-1",
    policyProvider: provider,
  });
  const otherWorkspace = "workspace://fixture/beta";
  const initial = coordinator.getSecurityRevision(WORKSPACE_IDENTITY);
  assert.deepEqual(initial, { coordinatorEpoch: "epoch-1", counter: 0 });
  assert.equal(coordinator.validateSecurityRevision(WORKSPACE_IDENTITY, initial), true);
  assert.equal(
    coordinator.validateSecurityRevision(WORKSPACE_IDENTITY, {
      coordinatorEpoch: "other",
      counter: 0,
    }),
    false,
  );

  coordinator.getSecurityRevision(otherWorkspace);
  provider.setWorkspacePolicy(WORKSPACE_IDENTITY, TRUSTED_POLICY);
  const bumped = coordinator.getSecurityRevision(WORKSPACE_IDENTITY);
  assert.equal(bumped.counter, 1);
  assert.equal(
    coordinator.getSecurityRevision(otherWorkspace).counter,
    0,
    "workspace 级变更不影响其他 workspace",
  );
  assert.equal(coordinator.validateSecurityRevision(WORKSPACE_IDENTITY, initial), false);

  coordinator.replacePersistentTrustRecords([makeRecord()], { status: "ok" });
  assert.equal(coordinator.getSecurityRevision(WORKSPACE_IDENTITY).counter, 2);
  const afterRevoke = coordinator.revoke({
    hookDeclarationDigests: [DECLARATION_DIGEST, DECLARATION_DIGEST],
    workspaceIdentity: WORKSPACE_IDENTITY,
  });
  assert.equal(afterRevoke.counter, 3);
  assert.equal(coordinator.validateSecurityRevision(WORKSPACE_IDENTITY, afterRevoke), true);

  provider.setDefaultPolicy({ mode: "user_decides", policyRevision: "fixture:default" });
  assert.equal(coordinator.getSecurityRevision(WORKSPACE_IDENTITY).counter, 4);
  assert.equal(
    coordinator.getSecurityRevision(otherWorkspace).counter,
    1,
    "默认级变更 bump 所有已知 identity",
  );
});

test("B11 策略 fail-closed、持久信任变更资格与 corrupt 状态", () => {
  const brokenProvider = {
    getPolicy: () => ({ mode: "unknown-mode" }),
    subscribe: () => () => {},
  };
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({
    coordinatorEpoch: "epoch-1",
    policyProvider: brokenProvider,
  });
  const evaluation = coordinator.evaluateSnapshot({ snapshot: makeSnapshot() });
  assert.deepEqual(evaluation.policy, {
    mode: "deny",
    reason: "Workspace Hook policy provider unavailable",
    policyRevision: "provider-error:fail-closed",
  });
  assert.equal(evaluation.reasonCode, "workspace_hooks_blocked_by_policy");
  assert.equal(evaluation.items[0].trustState, "blocked_policy");
  assert.equal(evaluation.items[0].effectiveRunnable, false);
  assert.equal(coordinator.canMutatePersistentTrust(WORKSPACE_IDENTITY), false);
  assert.throws(
    () => coordinator.assertPersistentTrustMutationAllowed(WORKSPACE_IDENTITY),
    /deny/u,
  );

  const permissive = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-2" });
  assert.equal(permissive.canMutatePersistentTrust(WORKSPACE_IDENTITY), true);
  assert.doesNotThrow(() => permissive.assertPersistentTrustMutationAllowed(WORKSPACE_IDENTITY));
  permissive.replacePersistentTrustRecords([makeRecord()], { status: "corrupt" });
  const corrupt = permissive.evaluateSnapshot({ snapshot: makeSnapshot() });
  assert.equal(corrupt.storeStatus, "corrupt");
  assert.equal(corrupt.reasonCode, "workspace_hooks_trust_store_corrupt");
  assert.equal(corrupt.items[0].trustState, "blocked_untrusted");
});

test("B12 trustState 判定顺序与 effectiveRunnable", () => {
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  const snapshot = makeSnapshot();

  const pending = coordinator.evaluateSnapshot({ snapshot });
  assert.equal(pending.items[0].trustState, "pending_trust");
  assert.equal(pending.items[0].admissionClass, "pending");
  assert.equal(pending.items[0].effectiveRunnable, false);
  assert.equal(pending.items[0].reasonCode, "workspace_hooks_pending_trust");
  assert.equal(pending.items[0].sourcePaths[0], "/tmp/fixture/.knorvia-studio/config.json");

  coordinator.replacePersistentTrustRecords([makeRecord()], { status: "ok" });
  const trusted = coordinator.evaluateSnapshot({ snapshot });
  assert.equal(trusted.items[0].trustState, "trusted_persistent");
  assert.equal(trusted.items[0].admissionClass, "admitted");
  assert.equal(trusted.items[0].effectiveRunnable, true);

  coordinator.revoke({
    hookDeclarationDigests: [DECLARATION_DIGEST],
    workspaceIdentity: WORKSPACE_IDENTITY,
  });
  const revoked = coordinator.evaluateSnapshot({ snapshot });
  assert.equal(revoked.items[0].trustState, "revoked");
  assert.equal(revoked.items[0].reasonCode, "workspace_hooks_revoked");

  // 同槽位但摘要不同的旧记录 → stale_digest
  const stale = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  stale.replacePersistentTrustRecords([makeRecord({ hookDeclarationDigest: digest("older") })], {
    status: "ok",
  });
  const staleEvaluation = stale.evaluateSnapshot({ snapshot });
  assert.equal(staleEvaluation.items[0].trustState, "stale_digest");
  assert.equal(staleEvaluation.items[0].reasonCode, "workspace_hook_declaration_changed");
});

test("B12 allow_trusted_only 缺记录时 blocked_policy，deny 优先于一切", () => {
  const provider = new hooks.InMemoryWorkspaceHookPolicyProvider();
  provider.setWorkspacePolicy(WORKSPACE_IDENTITY, {
    mode: "allow_trusted_only",
    policyRevision: "fixture:strict",
  });
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({
    coordinatorEpoch: "epoch-1",
    policyProvider: provider,
  });
  const blocked = coordinator.evaluateSnapshot({ snapshot: makeSnapshot() });
  assert.equal(blocked.items[0].trustState, "blocked_policy");
  assert.equal(blocked.items[0].admissionClass, "blocked");

  coordinator.replacePersistentTrustRecords([makeRecord()], { status: "ok" });
  const admitted = coordinator.evaluateSnapshot({ snapshot: makeSnapshot() });
  assert.equal(admitted.items[0].trustState, "trusted_persistent");
  assert.equal(admitted.items[0].effectiveRunnable, true);

  provider.setWorkspacePolicy(WORKSPACE_IDENTITY, {
    mode: "deny",
    reason: "policy locked",
    policyRevision: "fixture:locked",
  });
  const denied = coordinator.evaluateSnapshot({ snapshot: makeSnapshot() });
  assert.equal(denied.items[0].trustState, "blocked_policy");
  assert.equal(denied.items[0].effectiveRunnable, false);
});

test("B16 信任记录：去重、字段映射与错误", () => {
  const snapshot = makeSnapshot();
  const records = hooks.createWorkspaceHookTrustRecords({
    appVersion: "1.2.3",
    grantedAt: "2026-01-02T03:04:05.000Z",
    reviewItemIds: ["item-1", "item-1"],
    snapshot,
  });
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.workspaceIdentity, WORKSPACE_IDENTITY);
  assert.equal(record.hookDeclarationDigest, DECLARATION_DIGEST);
  assert.equal(record.digestAlgorithm, "sha256");
  assert.equal(record.decision, "trusted");
  assert.equal(record.grantedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(record.bundleDigestAtGrant, BUNDLE_DIGEST);
  assert.equal(record.eventAtGrant, "PreToolUse");
  assert.equal(record.displayCommandAtGrant, "node hook.mjs");
  assert.equal(record.sourcePathAtGrant, ".knorvia-studio/config.json");
  assert.equal(record.sourceDiscoveryOrderAtGrant, 0);
  assert.equal(record.matcherAtGrant, "Bash");
  assert.equal(record.matcherIndexAtGrant, 0);
  assert.equal(record.hookIndexAtGrant, 0);
  assert.equal(record.appVersionAtGrant, "1.2.3");

  assert.throws(
    () =>
      hooks.createWorkspaceHookTrustRecords({
        grantedAt: "2026-01-02T03:04:05.000Z",
        reviewItemIds: ["missing"],
        snapshot,
      }),
    /Unknown Workspace Hook review item/u,
  );

  const withoutArgs = hooks.createWorkspaceHookTrustRecords({
    grantedAt: "2026-01-02T03:04:05.000Z",
    reviewItemIds: ["item-1"],
    snapshot: makeSnapshot({ entry: { type: "command", command: "echo hi", args: undefined } }),
  });
  assert.equal(withoutArgs[0].displayCommandAtGrant, "echo hi");
  assert.equal(withoutArgs[0].appVersionAtGrant, undefined);
});
