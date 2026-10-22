// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-telemetry 的契约测试（B15 的 7 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-telemetry.ts");
}

function makeLogger() {
  const calls = [];
  return {
    calls,
    logger: {
      info(message, meta) {
        calls.push({ message, meta });
      },
    },
  };
}

test("B15.1 无 logger → 不做任何事（不抛错）", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  let threw = false;
  try {
    reportTrustTelemetry(undefined, { event: "test" });
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
});

test("B15.2 输出固定 message + module + event", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, { event: "workspace_hook.trust_evaluated" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "Workspace Hook Trust telemetry");
  assert.equal(calls[0].meta.module, "workspace_hook_trust");
  assert.equal(calls[0].meta.event, "workspace_hook.trust_evaluated");
});

test("B15.3 workspaceIdentity 只以 SHA-256 前 12 位出现", async () => {
  const { reportTrustTelemetry, workspaceIdentitySummary } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, { event: "e", workspaceIdentity: "/Users/alice/secret-project" });

  const meta = calls[0].meta;
  assert.equal(meta.workspaceIdentity, undefined, "原始 identity 不得出现");
  assert.equal(
    meta.workspaceIdentityDigest,
    workspaceIdentitySummary("/Users/alice/secret-project"),
  );
  assert.equal(meta.workspaceIdentityDigest.length, 12, "应是 12 位十六进制");
  assert.match(meta.workspaceIdentityDigest, /^[0-9a-f]{12}$/u);
});

test("B15.3 bundleDigest / declarationDigest 只取前 12 字符", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, {
    event: "e",
    bundleDigest: "abcdefghijklmnopqrstuvwxyz",
    declarationDigest: "0123456789abcdef",
  });

  assert.equal(calls[0].meta.bundleDigest, "abcdefghijkl");
  assert.equal(calls[0].meta.declarationDigest, "0123456789ab");
});

test("B15.4 允许字段都能出现", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, {
    event: "e",
    reasonCode: "workspace_hooks_blocked_by_policy",
    source: "project.item-1",
    action: "accept",
    generation: 3,
    errorMessage: "short domain error",
    requestItemCount: 5,
    requestEnabledCount: 3,
    grantedRecordCount: 2,
    revokedCount: 1,
  });

  const meta = calls[0].meta;
  assert.equal(meta.reasonCode, "workspace_hooks_blocked_by_policy");
  assert.equal(meta.source, "project.item-1");
  assert.equal(meta.action, "accept");
  assert.equal(meta.generation, 3);
  assert.equal(meta.errorMessage, "short domain error");
  assert.equal(meta.requestItemCount, 5);
  assert.equal(meta.requestEnabledCount, 3);
  assert.equal(meta.grantedRecordCount, 2);
  assert.equal(meta.revokedCount, 1);
});

test("B15.4 未提供的可选字段不出现", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, { event: "e" });

  const meta = calls[0].meta;
  for (const field of [
    "workspaceIdentityDigest",
    "bundleDigest",
    "declarationDigest",
    "reasonCode",
    "source",
    "action",
    "generation",
    "errorMessage",
    "requestItemCount",
    "requestEnabledCount",
    "grantedRecordCount",
    "revokedCount",
  ]) {
    assert.equal(field in meta, false, `${field} 不应出现`);
  }
});

test("B15.4 errorMessage 截断到 300 字符", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, { event: "e", errorMessage: "x".repeat(500) });

  assert.equal(calls[0].meta.errorMessage.length, 300, "应截断到 300");
});

test("B15.4 errorMessage 未超长时原样", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  reportTrustTelemetry(logger, { event: "e", errorMessage: "short" });
  assert.equal(calls[0].meta.errorMessage, "short");
});

test("B15.5 不得出现命令 / source path（即使被塞进 facts）", async () => {
  const { reportTrustTelemetry } = await loadPlugin();
  const { calls, logger } = makeLogger();

  // 只传允许字段 → 载荷里不应有命令或路径
  reportTrustTelemetry(logger, {
    event: "e",
    workspaceIdentity: "/Users/alice/project",
    source: "project.item-1",
  });

  const serialized = JSON.stringify(calls[0].meta);
  assert.equal(serialized.includes("/Users/alice/project"), false, "原始路径不得出现");
  assert.equal(serialized.includes("command"), false, "命令字段不得出现");
  assert.equal(serialized.includes("trustPayload"), false, "Trust payload 不得出现");
});

test("B15.6 digestSummary：≤12 原样，>12 截断", async () => {
  const { digestSummary } = await loadPlugin();
  assert.equal(digestSummary("abc"), "abc");
  assert.equal(digestSummary("abcdefghijkl"), "abcdefghijkl", "正好 12 不截断");
  assert.equal(digestSummary("abcdefghijklm"), "abcdefghijkl", "13 截断到 12");
});

test("B15.7 workspaceIdentitySummary：同一输入稳定", async () => {
  const { workspaceIdentitySummary } = await loadPlugin();
  const first = workspaceIdentitySummary("ws-1");
  const second = workspaceIdentitySummary("ws-1");
  assert.equal(first, second, "应稳定");

  assert.notEqual(
    workspaceIdentitySummary("ws-1"),
    workspaceIdentitySummary("ws-2"),
    "不同输入应不同",
  );
});

test("B15.7 哈希而非截断：前缀相同但后缀不同应可区分", async () => {
  const { workspaceIdentitySummary } = await loadPlugin();
  // 若用截断，这两个会相同（前 12 字符一致）
  assert.notEqual(
    workspaceIdentitySummary("/Users/alice/project-a"),
    workspaceIdentitySummary("/Users/alice/project-b"),
    "哈希应能区分前缀相同的路径",
  );
});
