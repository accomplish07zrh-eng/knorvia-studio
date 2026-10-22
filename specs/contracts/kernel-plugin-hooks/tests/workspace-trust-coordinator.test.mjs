// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-trust-coordinator 的契约测试（B11 的 7 条规格）。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-trust-coordinator.ts");
}

async function makeCoordinator(epoch = "epoch-1") {
  const { WorkspaceHookTrustCoordinator } = await loadPlugin();
  return new WorkspaceHookTrustCoordinator(epoch);
}

test("B11.1 空白 coordinatorEpoch → 构造抛错", async () => {
  const { WorkspaceHookTrustCoordinator } = await loadPlugin();
  for (const epoch of ["", "   ", "\t\n"]) {
    let caught;
    try {
      new WorkspaceHookTrustCoordinator(epoch);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, `空白 epoch "${JSON.stringify(epoch)}" 应抛错`);
  }
});

test("B11.2 首次访问 counter 为 0", async () => {
  const c = await makeCoordinator("ep");
  assert.deepEqual(c.getSecurityRevision("ws-1"), { coordinatorEpoch: "ep", counter: 0 });
});

test("B11.2 同一 identity 多次调用返回相同 counter", async () => {
  const c = await makeCoordinator();
  const first = c.getSecurityRevision("ws-1");
  const second = c.getSecurityRevision("ws-1");
  assert.deepEqual(first, second);
});

test("B11.3 bumpWorkspace 使 counter +1（只增不减）", async () => {
  const c = await makeCoordinator();
  assert.equal(c.bumpWorkspace("ws-1").counter, 1);
  assert.equal(c.bumpWorkspace("ws-1").counter, 2);
  assert.equal(c.getSecurityRevision("ws-1").counter, 2);
});

test("B11.3 不同 identity 的 counter 互不影响", async () => {
  const c = await makeCoordinator();
  c.bumpWorkspace("ws-1");
  c.bumpWorkspace("ws-1");
  assert.equal(c.getSecurityRevision("ws-1").counter, 2);
  assert.equal(c.getSecurityRevision("ws-2").counter, 0, "另一个 identity 不受影响");
});

test("B11.3 bumpAllKnown 覆盖「已出现过的 revision key」", async () => {
  const c = await makeCoordinator();
  c.getSecurityRevision("ws-a"); // 已知（取过 revision）
  c.bumpWorkspace("ws-b"); // 已知（bump 过）

  c.bumpAllKnown();

  assert.equal(c.getSecurityRevision("ws-a").counter, 1, "取过 revision 的也要 bump");
  assert.equal(c.getSecurityRevision("ws-b").counter, 2, "bump 过的再 +1");
});

test("B11.4 validateSecurityRevision：epoch 与 counter 都相等才 true", async () => {
  const c = await makeCoordinator("ep");

  const current = c.getSecurityRevision("ws-1");
  assert.equal(c.validateSecurityRevision("ws-1", current), true);

  // epoch 不同
  assert.equal(
    c.validateSecurityRevision("ws-1", { coordinatorEpoch: "other", counter: 0 }),
    false,
    "epoch 不同应 false",
  );

  // counter 过期
  c.bumpWorkspace("ws-1");
  assert.equal(c.validateSecurityRevision("ws-1", current), false, "counter 过期应 false");
});

test("B11.5 replacePersistentTrustRecords：写入并 bump 受影响 identity", async () => {
  const c = await makeCoordinator();

  c.replacePersistentTrustRecords({
    records: [{ workspaceIdentity: "ws-1", hookDeclarationDigest: "d1" }],
    state: { status: "ok" },
  });

  assert.equal(c.getSecurityRevision("ws-1").counter, 1, "写入的记录所在 workspace 应 bump");
  assert.ok(c.getPersistentRecord("ws-1", "d1"), "记录应可读回");
});

test("B11.5 写入的记录清除对应撤销标记", async () => {
  const c = await makeCoordinator();

  c.revoke({ workspaceIdentity: "ws-1", hookDeclarationDigests: ["d1"] });
  assert.equal(c.isRevoked("ws-1", "d1"), true);

  // 重新信任 → 撤销标记应被清除
  c.replacePersistentTrustRecords({
    records: [{ workspaceIdentity: "ws-1", hookDeclarationDigest: "d1" }],
    state: { status: "ok" },
  });

  assert.equal(c.isRevoked("ws-1", "d1"), false, "重新信任应覆盖曾经撤销");
});

test("B11.5 被替换掉的记录所在 workspace 也要 bump", async () => {
  const c = await makeCoordinator();

  c.replacePersistentTrustRecords({
    records: [{ workspaceIdentity: "ws-1", hookDeclarationDigest: "d1" }],
    state: { status: "ok" },
  });
  const before = c.getSecurityRevision("ws-1").counter;

  // 替换成「不含 ws-1 记录」的集合 → ws-1 的记录被移除 → 也应 bump
  c.replacePersistentTrustRecords({ records: [], state: { status: "ok" } });

  assert.ok(c.getSecurityRevision("ws-1").counter > before, "被移除记录的 workspace 也应 bump");
});

test("B11.5 state.status === corrupt → bump 所有已知 identity", async () => {
  const c = await makeCoordinator();

  c.getSecurityRevision("ws-a");
  c.replacePersistentTrustRecords({
    records: [{ workspaceIdentity: "ws-b", hookDeclarationDigest: "d" }],
    state: { status: "ok" },
  });

  const beforeA = c.getSecurityRevision("ws-a").counter;

  c.replacePersistentTrustRecords({ records: [], state: { status: "corrupt" } });

  assert.ok(c.getSecurityRevision("ws-a").counter > beforeA, "corrupt 应 bump 所有已知");
  assert.equal(c.getStoreStatus(), "corrupt");
});

test("B11.6 revoke：digest 去重、删除记录、记入撤销集合、bump 并返回新 revision", async () => {
  const c = await makeCoordinator();

  c.replacePersistentTrustRecords({
    records: [
      { workspaceIdentity: "ws-1", hookDeclarationDigest: "d1" },
      { workspaceIdentity: "ws-1", hookDeclarationDigest: "d2" },
    ],
    state: { status: "ok" },
  });
  const before = c.getSecurityRevision("ws-1").counter;

  const revision = c.revoke({
    workspaceIdentity: "ws-1",
    hookDeclarationDigests: ["d1", "d1", "d1"], // 重复
  });

  assert.equal(revision.counter, before + 1, "应 bump 一次（不是三次）");
  assert.equal(c.isRevoked("ws-1", "d1"), true);
  assert.equal(c.getPersistentRecord("ws-1", "d1"), undefined, "记录应被删除");
  assert.ok(c.getPersistentRecord("ws-1", "d2"), "其他记录不受影响");
});

test("B11.6 revoke 后 counter 不回退（只增不减）", async () => {
  const c = await makeCoordinator();
  const first = c.revoke({ workspaceIdentity: "ws-1", hookDeclarationDigests: ["d"] });
  const second = c.revoke({ workspaceIdentity: "ws-1", hookDeclarationDigests: ["d2"] });
  assert.ok(second.counter > first.counter, "counter 必须递增");
});

test("B11.7 索引 key 用 NUL 分隔（identity 与 digest 含分隔符也不冲突）", async () => {
  const c = await makeCoordinator();

  // identity 含 `:`，digest 也含 `:` —— 若用 `:` 分隔会冲突
  c.replacePersistentTrustRecords({
    records: [{ workspaceIdentity: "a:b", hookDeclarationDigest: "c:d" }],
    state: { status: "ok" },
  });

  assert.ok(c.getPersistentRecord("a:b", "c:d"), "应能正确读回");
  assert.equal(c.getPersistentRecord("a", "b:c:d"), undefined, "不应误匹配");
});

test("B11 实例隔离：两个协调者状态互不影响", async () => {
  const first = await makeCoordinator("ep-1");
  const second = await makeCoordinator("ep-2");

  first.bumpWorkspace("ws-1");

  assert.equal(first.getSecurityRevision("ws-1").counter, 1);
  assert.equal(second.getSecurityRevision("ws-1").counter, 0, "第二个实例不受影响");
  assert.equal(
    first.validateSecurityRevision("ws-1", second.getSecurityRevision("ws-1")),
    false,
    "不同 epoch 的 revision 不互相认可",
  );
});
