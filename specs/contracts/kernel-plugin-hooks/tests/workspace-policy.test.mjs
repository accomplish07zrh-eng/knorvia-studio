// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-policy 的契约测试（B10 的 8 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-policy.ts");
}

function provider() {
  return new (class {
    async create() {
      const { WorkspaceHookPolicyProvider } = await loadPlugin();
      return new WorkspaceHookPolicyProvider();
    }
  })();
}

test("B10.1 默认策略是 user_decides + builtin revision", async () => {
  const { WorkspaceHookPolicyProvider, DEFAULT_WORKSPACE_HOOK_POLICY } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();

  assert.deepEqual(p.getPolicy("ws-1"), DEFAULT_WORKSPACE_HOOK_POLICY);
  assert.equal(DEFAULT_WORKSPACE_HOOK_POLICY.mode, "user_decides");
  assert.equal(DEFAULT_WORKSPACE_HOOK_POLICY.policyRevision, "builtin:user-decides:v1");
});

test("B10.1 默认策略对象是冻结的", async () => {
  const { DEFAULT_WORKSPACE_HOOK_POLICY } = await loadPlugin();
  assert.equal(Object.isFrozen(DEFAULT_WORKSPACE_HOOK_POLICY), true, "默认策略必须冻结");
});

test("B10.2 未知 identity 返回默认策略（不报错）", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  assert.equal(p.getPolicy("never-seen").mode, "user_decides");
});

test("B10.3 setWorkspacePolicy 写入并通知", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const changes = [];
  p.subscribe((change) => changes.push(change));

  const policy = { mode: "deny", policyRevision: "ws:1" };
  p.setWorkspacePolicy("ws-1", policy);

  assert.deepEqual(p.getPolicy("ws-1"), policy);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].workspaceIdentity, "ws-1");
  assert.deepEqual(changes[0].policy, policy);
});

test("B10.3 与现值相等 → 不通知", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const policy = { mode: "deny", policyRevision: "ws:1" };
  p.setWorkspacePolicy("ws-1", policy);

  const changes = [];
  p.subscribe((change) => changes.push(change));
  p.setWorkspacePolicy("ws-1", { ...policy }); // 内容相同的新对象

  assert.equal(changes.length, 0, "无变化不应通知");
});

test("B10.4 clearWorkspacePolicy：本没有 → 不通知", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const changes = [];
  p.subscribe((change) => changes.push(change));

  p.clearWorkspacePolicy("never-set");
  assert.equal(changes.length, 0);
});

test("B10.4 clearWorkspacePolicy：有 → 删除并通知回落默认", async () => {
  const { WorkspaceHookPolicyProvider, DEFAULT_WORKSPACE_HOOK_POLICY } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  p.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "ws:1" });

  const changes = [];
  p.subscribe((change) => changes.push(change));
  p.clearWorkspacePolicy("ws-1");

  assert.equal(changes.length, 1);
  assert.equal(changes[0].workspaceIdentity, "ws-1");
  assert.deepEqual(changes[0].policy, DEFAULT_WORKSPACE_HOOK_POLICY, "应通知默认策略");
  assert.deepEqual(p.getPolicy("ws-1"), DEFAULT_WORKSPACE_HOOK_POLICY);
});

test("B10.5 setDefaultPolicy 通知不带 workspaceIdentity", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const changes = [];
  p.subscribe((change) => changes.push(change));

  p.setDefaultPolicy({ mode: "deny", policyRevision: "default:1" });

  assert.equal(changes.length, 1);
  assert.equal("workspaceIdentity" in changes[0], false, "默认策略通知不带 identity");
  assert.equal(changes[0].policy.mode, "deny");
});

test("B10.5 默认策略相等 → 不通知", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const changes = [];
  p.subscribe((change) => changes.push(change));

  p.setDefaultPolicy({ mode: "user_decides", policyRevision: "builtin:user-decides:v1" });
  assert.equal(changes.length, 0, "与默认相等不应通知");
});

test("B10.6 subscribe 返回取消函数；取消后不再收到通知", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const changes = [];
  const unsubscribe = p.subscribe((change) => changes.push(change));

  p.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "a" });
  assert.equal(changes.length, 1);

  unsubscribe();
  p.setWorkspacePolicy("ws-1", { mode: "allow_trusted_only", policyRevision: "b" });
  assert.equal(changes.length, 1, "取消后不应再收到");
});

test("B10.7 非法策略 → 抛错且状态不变", async () => {
  const { WorkspaceHookPolicyProvider, DEFAULT_WORKSPACE_HOOK_POLICY } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();

  let caught;
  try {
    p.setWorkspacePolicy("ws-1", { mode: "not-a-mode", policyRevision: "x" });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "非法策略应抛错");
  assert.deepEqual(p.getPolicy("ws-1"), DEFAULT_WORKSPACE_HOOK_POLICY, "状态不应改变");
});

test("B10.7 空 revision 也是非法", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  let caught;
  try {
    p.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "" });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
});

test("B10.8 状态所有者是实例：两个实例互不影响", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const first = new WorkspaceHookPolicyProvider();
  const second = new WorkspaceHookPolicyProvider();

  first.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "a" });

  assert.equal(first.getPolicy("ws-1").mode, "deny");
  assert.equal(second.getPolicy("ws-1").mode, "user_decides", "第二个实例不受影响");
});

test("B10.9 canMutatePersistentTrust 仅 user_decides 为 true", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();

  assert.equal(p.canMutatePersistentTrust("ws-1"), true, "默认 user_decides");

  p.setWorkspacePolicy("ws-2", { mode: "deny", policyRevision: "a" });
  assert.equal(p.canMutatePersistentTrust("ws-2"), false);

  p.setWorkspacePolicy("ws-3", { mode: "allow_trusted_only", policyRevision: "b" });
  assert.equal(p.canMutatePersistentTrust("ws-3"), false);
});

test("B10.9 assertPersistentTrustMutationAllowed 非 user_decides 时抛错含模式名", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  p.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "a" });

  let caught;
  try {
    p.assertPersistentTrustMutationAllowed("ws-1");
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.ok(caught.message.includes("deny"), `错误信息应含模式名，实际：${caught.message}`);
});

test("B10.10 默认策略变更后，后续 getPolicy 反映新默认值", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();

  p.setDefaultPolicy({ mode: "allow_trusted_only", policyRevision: "new-default" });
  assert.equal(p.getPolicy("any-ws").mode, "allow_trusted_only");
});

test("订阅者抛错不阻断其他订阅者", async () => {
  const { WorkspaceHookPolicyProvider } = await loadPlugin();
  const p = new WorkspaceHookPolicyProvider();
  const received = [];

  p.subscribe(() => {
    throw new Error("listener blew up");
  });
  p.subscribe((change) => received.push(change));

  p.setWorkspacePolicy("ws-1", { mode: "deny", policyRevision: "a" });
  assert.equal(received.length, 1, "第二个订阅者仍应收到");
});
