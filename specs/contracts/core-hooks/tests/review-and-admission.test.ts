// SPDX-License-Identifier: Apache-2.0
// B13、B14、B15：审核流程注册表、运行时准入与 telemetry 脱敏。
import assert from "node:assert/strict";
import test from "node:test";
import { hooks } from "./entry.mjs";
import {
  BUNDLE_DIGEST,
  DECLARATION_DIGEST,
  WORKSPACE_IDENTITY,
  makeLogger,
  makeReviewRequest,
  makeReviewTarget,
  makeSnapshot,
} from "../fixtures/builders.mjs";

const decision = { action: "trust_selected", reviewItemIds: ["item-1"] };

test("B13 open：同代返回同一 flow，不同代必须显式 supersede", () => {
  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  const request = makeReviewRequest();
  const flow = registry.open(request);
  assert.equal(flow.state.state, "pending");
  assert.equal(registry.open(request), flow);

  assert.throws(
    () => registry.open(makeReviewRequest({ generation: 2, interactionId: "interaction-2" })),
    /superseded explicitly/u,
  );
  assert.equal(registry.getCurrentFlow("session-1"), flow);
  const stateCopy = registry.getCurrent("session-1");
  stateCopy.state = "resolved";
  assert.equal(registry.getCurrent("session-1").state, "pending", "返回值是副本");
  assert.equal(registry.getCurrent("unknown-session"), undefined);
});

test("B13 resolve/fail/close 与幂等结算", async () => {
  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  const request = makeReviewRequest();
  const flow = registry.open(request);
  const target = makeReviewTarget();

  const accepted = registry.resolve(target, decision);
  assert.deepEqual(accepted, { accepted: true, reviewItemIds: ["item-1"] });
  assert.deepEqual(await flow.result, {
    action: "trust_selected",
    reviewItemIds: ["item-1"],
    reasonCode: undefined,
  });
  assert.equal(flow.state.state, "resolved");
  assert.equal(registry.resolve(target, decision).accepted, false, "已结算不可再结算");

  const failing = registry.open(makeReviewRequest({ reviewFlowId: "flow-2", generation: 1 }));
  assert.equal(
    registry.fail(
      makeReviewTarget({ reviewFlowId: "flow-2" }),
      "workspace_hooks_interaction_timeout",
    ),
    true,
  );
  assert.equal(failing.state.state, "cancelled");
  assert.deepEqual(await failing.result, {
    action: "no_change",
    reviewItemIds: [],
    reasonCode: "workspace_hooks_interaction_timeout",
  });
  assert.equal(
    registry.fail(makeReviewTarget({ reviewFlowId: "flow-2" }), "workspace_hooks_revoked"),
    false,
  );

  const closing = registry.open(makeReviewRequest({ reviewFlowId: "flow-3", generation: 1 }));
  assert.equal(registry.closeWithoutDecision(makeReviewTarget({ reviewFlowId: "flow-3" })), true);
  assert.deepEqual(await closing.result, {
    action: "no_change",
    reviewItemIds: [],
    reasonCode: undefined,
  });
});

test("B13 validate：superseded 与 snapshot_mismatch 的判定", () => {
  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  registry.open(makeReviewRequest());

  assert.deepEqual(registry.validate(makeReviewTarget({ generation: 9 }), decision), {
    accepted: false,
    reasonCode: "workspace_hooks_review_superseded",
  });
  assert.deepEqual(
    registry.validate(makeReviewTarget({ bundleDigest: "f".repeat(64) }), decision),
    {
      accepted: false,
      reasonCode: "workspace_hooks_snapshot_mismatch",
    },
  );
  assert.deepEqual(
    registry.validate(makeReviewTarget(), {
      action: "trust_selected",
      reviewItemIds: ["unknown-item"],
    }),
    { accepted: false, reasonCode: "workspace_hooks_snapshot_mismatch" },
  );
  assert.deepEqual(registry.validate(makeReviewTarget(), decision), {
    accepted: true,
    reviewItemIds: ["item-1"],
  });
  assert.throws(() => registry.validate(makeReviewTarget(), { action: "nope" }));
});

test("B13 supersede：旧流程立即结算，替换必须推进同一 flow", async () => {
  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  const first = registry.open(makeReviewRequest());
  const replacement = makeReviewRequest({
    generation: 2,
    interactionId: "interaction-2",
    createdAt: Date.now(),
    deadlineAt: Date.now() + 30_000,
  });
  const second = registry.supersede(makeReviewTarget(), replacement);
  assert.notEqual(second, first);
  assert.deepEqual(await first.result, {
    action: "no_change",
    reviewItemIds: [],
    reasonCode: "workspace_hooks_review_superseded",
  });
  assert.equal(first.state.state, "superseded");
  assert.equal(first.state.supersededByInteractionId, "interaction-2");
  assert.equal(second.state.state, "pending");

  assert.throws(
    () =>
      registry.supersede(
        makeReviewTarget(),
        makeReviewRequest({ generation: 2, interactionId: "interaction-3" }),
      ),
    /unknown Workspace Hook review generation/u,
  );
  assert.throws(
    () =>
      registry.supersede(
        makeReviewTarget({ generation: 2, interactionId: "interaction-2" }),
        makeReviewRequest({
          generation: 2,
          interactionId: "interaction-4",
          createdAt: Date.now(),
          deadlineAt: Date.now() + 1000,
        }),
      ),
    /must advance/u,
  );
});

test("B13 超时：deadline 到达后结算为 timed_out（含已过期立即结算）", async () => {
  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  const past = registry.open(
    makeReviewRequest({
      createdAt: Date.now() - 5000,
      deadlineAt: Date.now() - 1,
    }),
  );
  assert.deepEqual(await past.result, {
    action: "no_change",
    reviewItemIds: [],
    reasonCode: "workspace_hooks_interaction_timeout",
  });
  assert.equal(past.state.state, "timed_out");
});

test("B14 准入：未激活、快照不匹配、失效与启用状态", async () => {
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  const snapshot = makeSnapshot();
  const states = [];
  const admission = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    onAdmissionStateChanged: (state) => states.push(state),
    ready: Promise.resolve(),
    snapshot,
  });

  assert.deepEqual(
    admission.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: false,
      reasonCode: "workspace_hooks_pending_trust",
    },
  );
  assert.deepEqual(
    admission.evaluateDispatch({
      bundleDigest: "a".repeat(64),
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    { allowed: false, reasonCode: "workspace_hooks_snapshot_mismatch" },
  );

  await admission.activate("startup");
  assert.equal(states.at(-1).pendingCount, 1);
  assert.deepEqual(
    admission.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: false,
      reasonCode: "workspace_hooks_pending_trust",
    },
  );

  coordinator.replacePersistentTrustRecords(
    [
      {
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
      },
    ],
    { status: "ok" },
  );
  assert.deepEqual(
    admission.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: true,
    },
  );
  assert.equal(states.at(-1).pendingCount, 0, "revision 变化后重发 admission state");

  admission.invalidate("workspace_hooks_revoked");
  assert.deepEqual(
    admission.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: false,
      reasonCode: "workspace_hooks_revoked",
    },
  );
});

test("B14 功能关闭、跨 workspace 替换与 trusted-only 策略拒绝", async () => {
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  const states = [];
  const logger = makeLogger();
  const disabled = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    enabled: false,
    logger,
    onAdmissionStateChanged: (state) => states.push(state),
    ready: Promise.resolve(),
    snapshot: makeSnapshot(),
  });
  await disabled.activate("resume");
  assert.deepEqual(
    disabled.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: false,
      reasonCode: "workspace_hooks_feature_disabled",
    },
  );
  assert.equal(states.length, 1);
  assert.equal(states[0].pendingCount, 0);
  assert.equal(logger.entries[0].fields.reasonCode, "workspace_hooks_feature_disabled");

  const enabled = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    ready: Promise.resolve(),
    snapshot: makeSnapshot(),
  });
  assert.throws(
    () => enabled.replaceSnapshot(makeSnapshot({ workspaceIdentity: "workspace://fixture/beta" })),
    /across workspace identities/u,
  );

  const denyProvider = {
    getPolicy: () => ({ mode: "deny", reason: "locked", policyRevision: "fixture:locked" }),
    subscribe: () => () => {},
  };
  const denied = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator: new hooks.WorkspaceHookTrustCoordinator({
      coordinatorEpoch: "epoch-2",
      policyProvider: denyProvider,
    }),
    logger,
    ready: Promise.resolve(),
    snapshot: makeSnapshot(),
  });
  await denied.activate("startup");
  const blocked = denied.evaluateDispatch({
    hookDeclarationDigest: DECLARATION_DIGEST,
    reviewItemId: "item-1",
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasonCode, "workspace_hooks_blocked_by_policy");
  assert.ok(
    logger.entries.some((entry) => entry.fields.event === "workspace_hook.policy_blocked"),
    "策略拒绝上报一次 telemetry",
  );
});

test("B14 bootstrap 失败 fail-closed 且不抛错", async () => {
  const coordinator = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  const admission = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    ready: Promise.reject(new Error("store unavailable")),
    snapshot: makeSnapshot(),
  });
  await admission.activate("startup");
  assert.deepEqual(
    admission.evaluateDispatch({
      hookDeclarationDigest: DECLARATION_DIGEST,
      reviewItemId: "item-1",
    }),
    {
      allowed: false,
      reasonCode: "workspace_hooks_trust_store_corrupt",
    },
  );

  const aborted = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    ready: new Promise(() => {}),
    snapshot: makeSnapshot(),
  });
  const controller = new AbortController();
  controller.abort(new Error("cancelled by test"));
  await assert.rejects(() => aborted.activate("startup", controller.signal), /cancelled by test/u);
});

test("B15 telemetry：字段脱敏、摘要截断与空 logger", () => {
  const logger = makeLogger();
  hooks.emitWorkspaceHookTelemetry(undefined, "workspace_hook.feature_disabled", {});
  assert.equal(logger.entries.length, 0);

  hooks.emitWorkspaceHookTelemetry(logger, "workspace_hook.trust_selected", {
    action: "trust_selected",
    bundleDigest: BUNDLE_DIGEST,
    declarationDigest: DECLARATION_DIGEST,
    errorMessage: "x".repeat(400),
    generation: 3,
    grantedRecordCount: 2,
    reasonCode: "workspace_hooks_trusted_persistent",
    workspaceIdentity: "/tmp/secret-workspace-path",
  });
  const [entry] = logger.entries;
  assert.equal(entry.level, "info");
  assert.equal(entry.message, "Workspace Hook Trust telemetry");
  assert.equal(entry.fields.module, "workspace_hook_trust");
  assert.equal(entry.fields.event, "workspace_hook.trust_selected");
  assert.equal(entry.fields.bundleDigest, BUNDLE_DIGEST.slice(0, 12));
  assert.equal(entry.fields.declarationDigest, DECLARATION_DIGEST.slice(0, 12));
  assert.equal(entry.fields.generation, 3);
  assert.equal(entry.fields.grantedRecordCount, 2);
  assert.equal(entry.fields.errorMessage.length, 300);
  assert.match(entry.fields.workspaceIdentityDigest, /^[a-f0-9]{12}$/u);
  assert.equal(JSON.stringify(entry.fields).includes("secret-workspace-path"), false);
  assert.equal(hooks.digestSummary("1234567890123"), "123456789012");
  assert.equal(hooks.digestSummary("123456789012"), "123456789012");
  assert.equal(hooks.workspaceIdentitySummary("/tmp/a"), hooks.workspaceIdentitySummary("/tmp/a"));
});
