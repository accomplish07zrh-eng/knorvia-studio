// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：workspace-hook 六件（behavior B1–B12，金样②）。
// 金样口径：绝对路径不是契约面——夹具以 <ROOT> 占位记录，测试端按运行时根反归一重建、
// 再把运行结果归一后逐字段比对；摘要载荷只吃相对路径，逐字节比对（B6/B8）。
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { loadModule } from "./entry.mjs";
import { workspaceHookGolden as golden } from "./fixtures.mjs";

const config = await loadModule("workspace-hook-config");
const digest = await loadModule("workspace-hook-digest");
const trust = await loadModule("workspace-hook-trust-store-file");
const review = await loadModule("workspace-hook-review-monotonicity");

const runtimeRoot = resolve("ws").split("\\").join("/");
const denormalize = (value) => {
  if (typeof value === "string") {
    return value.startsWith("<ROOT>") ? runtimeRoot + value.slice("<ROOT>".length) : value;
  }
  if (Array.isArray(value)) return value.map(denormalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = denormalize(v);
    return out;
  }
  return value;
};
const normalize = (value) => {
  if (typeof value === "string") {
    const flat = value.split("\\").join("/");
    return flat.startsWith(runtimeRoot) ? "<ROOT>" + flat.slice(runtimeRoot.length) : flat;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
};

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
  const runtimeRootInput = { enabled: true, timeoutMs: 60000, maxOutputBytes: 32768 };
  // 两端都走 createWorkspaceHookSourceInput（同一原始输入）——绝对路径不是契约面，摘要载荷只吃相对路径
  const sources = golden.sourceInputs.map((input) => config.createWorkspaceHookSourceInput(input));
  const rebuilt = digest.resolveWorkspaceHookEntries({
    workspacePath: "ws",
    sources,
    runtimeRoot: runtimeRootInput,
  });
  assert.deepEqual(rebuilt, golden.entries, "entries 逐字段一致（源相对路径与摘要逐字节）");
  assert.equal(rebuilt.length, 5);
  const snapshot = digest.buildWorkspaceHookBundleSnapshot({
    workspaceIdentity: "ws-identity-1",
    workspacePath: "ws",
    sources,
    runtimeRoot: runtimeRootInput,
    discoveredAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(normalize(snapshot), golden.snapshot, "快照逐字段（绝对路径按根归一）");
  assert.equal(snapshot.bundleDigest, golden.snapshot.bundleDigest, "bundleDigest 逐字节");
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
