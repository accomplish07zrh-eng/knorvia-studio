// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-registration 的契约测试（B6 的 5 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-registration.ts");
}

function entry(overrides = {}) {
  return {
    event: "PreToolUse",
    reviewItemId: "item-1",
    resolvedTimeoutMs: 3000,
    resolvedMaxOutputBytes: 2048,
    hook: { type: "command", command: "ws-hook" },
    ...overrides,
  };
}

const allowAll = () => true;
const denyAll = () => false;

test("B6.1 不提供 admission/snapshot → 不产生 workspace 项", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  assert.deepEqual(registerWorkspaceHooks(undefined), []);
});

test("B6.2 每条登记的 source = project.<reviewItemId>、sourceKind = project", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry({ reviewItemId: "item-42" })] },
  });

  assert.equal(registered.length, 1);
  assert.equal(registered[0].source, "project.item-42");
  assert.equal(registered[0].sourceKind, "project");
});

test("B6.2 timeoutMs / maxOutputBytes 用**解析后**的值", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry({ resolvedTimeoutMs: 9999, resolvedMaxOutputBytes: 777 })] },
  });

  assert.equal(registered[0].timeoutMs, 9999);
  assert.equal(registered[0].maxOutputBytes, 777);
});

test("B6.2 admission 拒绝的条目不产生登记项", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: denyAll,
    snapshot: { entries: [entry()] },
  });
  assert.equal(registered.length, 0);
});

test("B6.2 admission 收到 digest 与 reviewItemId", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  let seen;
  registerWorkspaceHooks({
    admission: (request) => {
      seen = request;
      return true;
    },
    snapshot: { entries: [entry({ reviewItemId: "item-7" })] },
  });

  assert.ok(seen);
  assert.equal(seen.reviewItemId, "item-7");
  assert.equal(typeof seen.hookDeclarationDigest, "string");
  assert.ok(seen.hookDeclarationDigest.length > 0);
});

test("B6.2 matcher 缺省时登记项不带 matcher 字段", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry()] },
  });
  assert.equal("matcher" in registered[0], false);

  const withMatcher = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry({ matcher: "bash" })] },
  });
  assert.equal(withMatcher[0].matcher, "bash");
});

test("B6.3 sourcePath 取快照 sourceFiles 的 canonicalPath", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: {
      entries: [entry({ sourceFileIndex: 0 })],
      sourceFiles: [{ canonicalPath: "/repo/.agents/hooks.yaml" }],
    },
  });
  assert.equal(registered[0].sourcePath, "/repo/.agents/hooks.yaml");
});

test("B6.3 canonicalPath 缺失时 sourcePath 不出现", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const registered = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry({ sourceFileIndex: 0 })], sourceFiles: [{}] },
  });
  assert.equal("sourcePath" in registered[0], false);
});

test("B6.3 statusMessage 只在有值时出现", async () => {
  const { registerWorkspaceHooks } = await loadPlugin();
  const without = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry()] },
  });
  assert.equal("statusMessage" in without[0], false);

  const withMessage = registerWorkspaceHooks({
    admission: allowAll,
    snapshot: { entries: [entry({ statusMessage: "pending review" })] },
  });
  assert.equal(withMessage[0].statusMessage, "pending review");
});

test("B6.4 插入到第一个非 user 项之前", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();
  const eventOf = () => "PreToolUse";

  const configured = [
    { source: "user-1", sourceKind: "user" },
    { source: "internal-1", sourceKind: "internal" },
    { source: "internal-2", sourceKind: "internal" },
  ];
  const workspace = [{ source: "project.a", sourceKind: "project" }];

  const merged = mergeWorkspaceHooks(configured, workspace, eventOf);

  assert.deepEqual(
    merged.map((h) => h.source),
    ["user-1", "project.a", "internal-1", "internal-2"],
    "项目 Hook 应在第一个非 user 项之前，但不越过 user",
  );
});

test("B6.4 没有非 user 项 → 追加到末尾", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();
  const eventOf = () => "PreToolUse";

  const configured = [
    { source: "user-1", sourceKind: "user" },
    { source: "user-2", sourceKind: "user" },
  ];
  const workspace = [{ source: "project.a", sourceKind: "project" }];

  const merged = mergeWorkspaceHooks(configured, workspace, eventOf);
  assert.deepEqual(
    merged.map((h) => h.source),
    ["user-1", "user-2", "project.a"],
  );
});

test("B6.4 配置项为空 → workspace 项直接进入", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();
  const merged = mergeWorkspaceHooks(
    [],
    [{ source: "project.a", sourceKind: "project" }],
    () => "PreToolUse",
  );
  assert.deepEqual(
    merged.map((h) => h.source),
    ["project.a"],
  );
});

test("B6.4 无 workspace 项 → 配置序列原样返回", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();
  const configured = [{ source: "user-1", sourceKind: "user" }];
  const merged = mergeWorkspaceHooks(configured, [], () => "PreToolUse");
  assert.deepEqual(
    merged.map((h) => h.source),
    ["user-1"],
  );
});

test("B6.5 同一事件内 workspace 项保持快照顺序", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();
  const eventOf = () => "PreToolUse";

  const workspace = [
    { source: "project.first", sourceKind: "project" },
    { source: "project.second", sourceKind: "project" },
    { source: "project.third", sourceKind: "project" },
  ];
  const merged = mergeWorkspaceHooks(
    [{ source: "internal-1", sourceKind: "internal" }],
    workspace,
    eventOf,
  );

  assert.deepEqual(
    merged.map((h) => h.source),
    ["project.first", "project.second", "project.third", "internal-1"],
  );
});

test("B6.4 多事件互不干扰（每个事件独立计算插入位置）", async () => {
  const { mergeWorkspaceHooks } = await loadPlugin();

  const configured = [
    { source: "a-user", sourceKind: "user", event: "PreToolUse" },
    { source: "a-internal", sourceKind: "internal", event: "PreToolUse" },
    { source: "b-user", sourceKind: "user", event: "Stop" },
  ];
  const workspace = [
    { source: "a-project", sourceKind: "project", event: "PreToolUse" },
    { source: "b-project", sourceKind: "project", event: "Stop" },
  ];
  const eventOf = (hook) => hook.event;

  const merged = mergeWorkspaceHooks(configured, workspace, eventOf);
  const bySource = new Map(merged.map((h, index) => [h.source, index]));

  // PreToolUse：a-project 应在 a-internal 之前、a-user 之后
  assert.ok(bySource.get("a-user") < bySource.get("a-project"), "user 在项目 Hook 之前");
  assert.ok(bySource.get("a-project") < bySource.get("a-internal"), "项目 Hook 在 internal 之前");

  // Stop：只有 user → 项目 Hook 追加在末尾
  assert.ok(bySource.get("b-user") < bySource.get("b-project"));
});

test("hookDeclarationDigestOf：对声明内容敏感、对无关字段不敏感", async () => {
  const { hookDeclarationDigestOf } = await loadPlugin();

  const base = entry();
  const same = { ...base };
  assert.equal(
    hookDeclarationDigestOf(base),
    hookDeclarationDigestOf(same),
    "相同声明应得到相同 digest",
  );

  const differentCommand = { ...base, hook: { type: "command", command: "other" } };
  assert.notEqual(
    hookDeclarationDigestOf(base),
    hookDeclarationDigestOf(differentCommand),
    "命令不同 → digest 不同",
  );

  const differentTimeout = { ...base, resolvedTimeoutMs: 9999 };
  assert.equal(
    hookDeclarationDigestOf(base),
    hookDeclarationDigestOf(differentTimeout),
    "超时不影响 digest（它不是声明内容）",
  );
});

test("B6.5 process 类型的 args 参与 digest", async () => {
  const { hookDeclarationDigestOf } = await loadPlugin();
  const first = entry({ hook: { type: "process", command: "x", args: ["a"] } });
  const second = entry({ hook: { type: "process", command: "x", args: ["b"] } });
  assert.notEqual(hookDeclarationDigestOf(first), hookDeclarationDigestOf(second));
});
