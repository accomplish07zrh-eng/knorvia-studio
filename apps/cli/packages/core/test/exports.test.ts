// SPDX-License-Identifier: Apache-2.0
// B18：公开入口与类型面的运行时可观察部分。
// 类型名（WorkspaceHookRuntimeAdmissionPort 等）只在类型层，运行时不可断言；
// 替换实现时由根/CLI 的 pnpm typecheck 覆盖类型面，本文件覆盖值导出与最小可用性。
import assert from "node:assert/strict";
import test from "node:test";
import { hooks } from "./core-hooks-entry.mjs";
import {
  BUNDLE_DIGEST,
  WORKSPACE_IDENTITY,
  digest,
  makeHookConfig,
  makeSnapshot,
} from "./fixtures/core-hooks-builders.mjs";

test("B18 值导出齐全且可被实例化/调用", () => {
  const functions = [
    "createConfiguredHookRunner",
    "createInMemoryHookRunner",
    "createSessionMailboxHookRegistrations",
    "createHookExecutionDescriptor",
    "sanitizeHookDisplayText",
    "createWorkspaceHookTrustRecords",
    "createWorkspaceHookRuntimeAdmission",
    "emitWorkspaceHookTelemetry",
    "digestSummary",
    "workspaceIdentitySummary",
  ];
  const classes = [
    "InMemoryHookRunner",
    "InMemoryWorkspaceHookPolicyProvider",
    "WorkspaceHookTrustCoordinator",
    "WorkspaceHookReviewFlowRegistry",
    "WorkspaceHookRuntimeAdmission",
  ];
  for (const name of functions) assert.equal(typeof hooks[name], "function", name);
  for (const name of classes) assert.equal(typeof hooks[name], "function", name);

  assert.equal(typeof new hooks.InMemoryHookRunner().run, "function");
  assert.equal(hooks.digestSummary("abcdefghijklmnop"), "abcdefghijkl");
  assert.equal(hooks.digestSummary("short"), "short");
  assert.match(hooks.workspaceIdentitySummary("/tmp/workspace"), /^[a-f0-9]{12}$/u);
  assert.equal(hooks.sanitizeHookDisplayText(""), "");
  assert.equal(hooks.createHookExecutionDescriptor(makeHookConfig(), 1234).timeoutMs, 1234);

  const policy = new hooks.InMemoryWorkspaceHookPolicyProvider();
  assert.deepEqual(policy.getPolicy(WORKSPACE_IDENTITY), {
    mode: "user_decides",
    policyRevision: "builtin:user-decides:v1",
  });

  const coordinator = new hooks.WorkspaceHookTrustCoordinator({ coordinatorEpoch: "epoch-1" });
  assert.deepEqual(coordinator.getSecurityRevision(WORKSPACE_IDENTITY), {
    coordinatorEpoch: "epoch-1",
    counter: 0,
  });

  const registry = new hooks.WorkspaceHookReviewFlowRegistry();
  assert.equal(registry.getCurrent("missing-session"), undefined);

  const admission = hooks.createWorkspaceHookRuntimeAdmission({
    coordinator,
    ready: Promise.resolve(),
    snapshot: makeSnapshot(),
  });
  assert.equal(admission.getCurrentSnapshot().bundleDigest, BUNDLE_DIGEST);

  const registration = hooks.createSessionMailboxHookRegistrations({
    mailbox: { drainUnread: async () => [] },
    sessionId: "session-1",
  });
  assert.equal(registration.length, 3);

  const snapshot = makeSnapshot();
  const records = hooks.createWorkspaceHookTrustRecords({
    grantedAt: "2026-01-01T00:00:00.000Z",
    reviewItemIds: [snapshot.hooks[0].reviewItemId],
    snapshot,
  });
  assert.equal(records[0].hookDeclarationDigest, digest("declaration"));
});
