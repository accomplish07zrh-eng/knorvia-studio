// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-trust-records 的契约测试（B16 的 4 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-trust-records.ts");
}

function snapshot(overrides = {}) {
  return {
    workspaceIdentity: "ws-1",
    bundleDigest: "bundle-1",
    entries: [
      {
        reviewItemId: "item-a",
        hookDeclarationDigest: "digest-a",
        event: "PreToolUse",
        hook: { type: "process", command: "/bin/hook", args: ["--x", "v"] },
        sourceFileIndex: 0,
        matcher: "bash",
        matcherIndex: 0,
        hookIndex: 0,
      },
    ],
    sourceFiles: [{ canonicalPath: "/repo/.agents/hooks.yaml", discoveryOrder: 2 }],
    ...overrides,
  };
}

const GRANTED_AT = "2026-10-23T00:00:00.000Z";

test("B16.1 reviewItemIds 去重且保持首次出现顺序", async () => {
  const { createTrustRecords } = await loadPlugin();
  const records = createTrustRecords(
    snapshot({
      entries: [
        {
          reviewItemId: "a",
          hookDeclarationDigest: "d-a",
          event: "PreToolUse",
          hook: { type: "command", command: "x" },
          sourceFileIndex: 0,
        },
        {
          reviewItemId: "b",
          hookDeclarationDigest: "d-b",
          event: "PreToolUse",
          hook: { type: "command", command: "y" },
          sourceFileIndex: 0,
        },
      ],
    }),
    ["b", "a", "b", "a"],
    GRANTED_AT,
  );

  assert.equal(records.length, 2, "应去重到 2 条");
  assert.deepEqual(
    records.map((r) => r.hookDeclarationDigest),
    ["d-b", "d-a"],
    "保持首次出现顺序（b 先出现）",
  );
});

test("B16.2 未知 reviewItemId → 抛错含 id", async () => {
  const { createTrustRecords } = await loadPlugin();
  let caught;
  try {
    createTrustRecords(snapshot(), ["unknown-item"], GRANTED_AT);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.match(caught.message, /Unknown Workspace Hook review item: unknown-item/u);
});

test("B16.2 条目存在但缺 source file → 抛错", async () => {
  const { createTrustRecords } = await loadPlugin();
  let caught;
  try {
    createTrustRecords(snapshot({ sourceFiles: [] }), ["item-a"], GRANTED_AT);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.match(caught.message, /Workspace Hook source is missing for item-a/u);
});

test("B16.3 记录字段完整（process 类型）", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(snapshot(), ["item-a"], GRANTED_AT);

  assert.equal(record.workspaceIdentity, "ws-1");
  assert.equal(record.hookDeclarationDigest, "digest-a");
  assert.equal(record.digestAlgorithm, "sha256");
  assert.equal(record.decision, "trusted");
  assert.equal(record.grantedAt, GRANTED_AT);
  assert.equal(record.bundleDigestAtGrant, "bundle-1");
  assert.equal(record.eventAtGrant, "PreToolUse");
  assert.equal(
    record.displayCommandAtGrant,
    "/bin/hook --x v",
    "process = command + args.join(' ')",
  );
  assert.equal(record.sourcePathAtGrant, "/repo/.agents/hooks.yaml");
  assert.equal(record.sourceDiscoveryOrderAtGrant, 2);
  assert.equal(record.matcherAtGrant, "bash");
  assert.equal(record.matcherIndexAtGrant, 0);
  assert.equal(record.hookIndexAtGrant, 0);
});

test("B16.3 command 类型的 displayCommandAtGrant 就是 command", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(
    snapshot({
      entries: [
        {
          reviewItemId: "item-a",
          hookDeclarationDigest: "digest-a",
          event: "PreToolUse",
          hook: { type: "command", command: "echo hi && ls" },
          sourceFileIndex: 0,
        },
      ],
    }),
    ["item-a"],
    GRANTED_AT,
  );
  assert.equal(record.displayCommandAtGrant, "echo hi && ls");
});

test("B16.3 process 无 args 时 displayCommandAtGrant 不带尾随空格", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(
    snapshot({
      entries: [
        {
          reviewItemId: "item-a",
          hookDeclarationDigest: "digest-a",
          event: "PreToolUse",
          hook: { type: "process", command: "/bin/hook" },
          sourceFileIndex: 0,
        },
      ],
    }),
    ["item-a"],
    GRANTED_AT,
  );
  assert.equal(record.displayCommandAtGrant, "/bin/hook");
});

test("B16.3 matcher 缺失时 matcherAtGrant 不出现", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(
    snapshot({
      entries: [
        {
          reviewItemId: "item-a",
          hookDeclarationDigest: "digest-a",
          event: "PreToolUse",
          hook: { type: "command", command: "x" },
          sourceFileIndex: 0,
        },
      ],
    }),
    ["item-a"],
    GRANTED_AT,
  );
  assert.equal("matcherAtGrant" in record, false);
});

test("B16.3 appVersion 有则带 appVersionAtGrant", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(snapshot({ appVersion: "1.2.3" }), ["item-a"], GRANTED_AT);
  assert.equal(record.appVersionAtGrant, "1.2.3");
});

test("B16.3 appVersion 缺失时 appVersionAtGrant 不出现", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(snapshot(), ["item-a"], GRANTED_AT);
  assert.equal("appVersionAtGrant" in record, false);
});

test("B16.3 canonicalPath 缺失时回退 sourceRelativePath", async () => {
  const { createTrustRecords } = await loadPlugin();
  const [record] = createTrustRecords(
    snapshot({ sourceFiles: [{ sourceRelativePath: ".agents/hooks.yaml", discoveryOrder: 1 }] }),
    ["item-a"],
    GRANTED_AT,
  );
  assert.equal(record.sourcePathAtGrant, ".agents/hooks.yaml");
});

test("B16.4 纯函数：不修改快照", async () => {
  const { createTrustRecords } = await loadPlugin();
  const snap = snapshot();
  const before = JSON.stringify(snap);

  createTrustRecords(snap, ["item-a"], GRANTED_AT);

  assert.equal(JSON.stringify(snap), before, "快照不应被修改");
});

test("B16.4 纯函数：相同入参恒等输出", async () => {
  const { createTrustRecords } = await loadPlugin();
  const first = createTrustRecords(snapshot(), ["item-a"], GRANTED_AT);
  const second = createTrustRecords(snapshot(), ["item-a"], GRANTED_AT);
  assert.deepEqual(first, second);
});

test("displayCommandAtGrant 单独导出可用", async () => {
  const { displayCommandAtGrant } = await loadPlugin();
  assert.equal(
    displayCommandAtGrant({ type: "process", command: "/bin/x", args: ["a", "b"] }),
    "/bin/x a b",
  );
  assert.equal(displayCommandAtGrant({ type: "command", command: "echo x" }), "echo x");
});
