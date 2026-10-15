// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：workspace-hook 六件（behavior B1–B12，金样②）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";
import { workspaceHookGolden as golden } from "./fixtures.mjs";

const config = await loadModule("workspace-hook-config");
const digest = await loadModule("workspace-hook-digest");
const trust = await loadModule("workspace-hook-trust-store-file");
const review = await loadModule("workspace-hook-review-monotonicity");

test("B1 语义常量逐字冻结", () => {
  assert.equal(config.WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION, golden.constants.digestSchemaVersion);
  assert.equal(config.DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS, 60000);
  assert.equal(config.DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES, 32768);
  assert.deepEqual(
    [...config.WORKSPACE_HOOK_EVENT_NAMES],
    [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PostToolUseFailure",
      "Stop",
    ],
  );
  assert.equal(
    trust.WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION,
    golden.constants.trustSchemaVersion,
  );
});

test("B1 schema 形态：strict/宽容边界（金样 parseCases）", () => {
  for (const c of golden.parseCases) {
    const result = config.workspaceHooksConfigSchema.safeParse(c.value);
    assert.equal(result.success, c.ok, `${c.name} 的解析结论`);
  }
  assert.deepEqual(
    config.workspaceHooksConfigSchema.parse(golden.parseCases[1].value),
    golden.parseCases[1].parsed,
    "passthrough 保留未知键",
  );
});

test("B4 限额解析（金样 timeoutCases）", () => {
  for (const c of golden.timeoutCases) {
    assert.equal(
      config.resolveWorkspaceHookTimeoutMs(c.hook, c.defaultTimeoutMs),
      c.actual,
      `timeout(${JSON.stringify(c.hook)})`,
    );
    assert.equal(c.actual, c.expected);
  }
});

test("B5 配置态门（金样 gateCases）", () => {
  for (const c of golden.gateCases) {
    assert.deepEqual(config.resolveWorkspaceHookConfiguredGates(c.input), c.actual);
    assert.deepEqual(c.actual, c.expected);
    assert.deepEqual(Object.keys(c.actual), [
      "sourceRootEnabled",
      "declarationEnabled",
      "runtimeHooksEnabled",
      "configuredEnabled",
    ]);
  }
});

test("B7/B8 条目解析与 bundle 摘要逐字节（金样）", () => {
  const runtimeRoot = { enabled: true, timeoutMs: 60000, maxOutputBytes: 32768 };
  const rebuilt = digest.resolveWorkspaceHookEntries({
    workspacePath: "/ws",
    sources: [golden.sources, golden.sourceB],
    runtimeRoot,
  });
  assert.deepEqual(rebuilt, golden.entries, "entries 逐字段一致");
  assert.equal(rebuilt.length, 5);
  const snapshot = digest.buildWorkspaceHookBundleSnapshot({
    workspaceIdentity: "ws-identity-1",
    workspacePath: "/ws",
    sources: [golden.sources, golden.sourceB],
    runtimeRoot,
    discoveredAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(snapshot, golden.snapshot, "快照逐字节");
  assert.equal(snapshot.bundleDigest, golden.snapshot.bundleDigest);
  assert.equal(golden.bundleDigestStable, golden.snapshot.bundleDigest, "discoveredAt 不入摘要");
  assert.ok(Object.isFrozen(snapshot), "快照深冻结");
});

test("B10 trust store：fail-closed 与唯一键（金样 trustCases）", () => {
  for (const c of golden.trustCases) {
    const result = trust.parseWorkspaceHookTrustStoreContent(c.content);
    assert.deepEqual(result, c.result, c.name);
    if (c.name !== "valid") assert.equal(result.status, "invalid", `${c.name} 必须 fail-closed`);
  }
});

test("B9 review 单调性六 verdict（金样 reviewCases）", () => {
  for (const c of golden.reviewCases) {
    assert.equal(
      review.verdictWorkspaceHookReviewRequest(c.current, c.candidate),
      c.verdict,
      c.name,
    );
  }
});
