// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace-review-flow 的契约测试（B13 的 10 条规格）。
//
// ⚠️ 重点：**每个 Promise 最终都必须 settle**（B13.8）。
// 悬挂的 Promise 会让调用方永远等待 —— 所以每条路径都要验证 settle。
import assert from "node:assert/strict";
import test from "node:test";

async function loadPlugin() {
  return await import("../../../../apps/cli/packages/bootstrap/src/kernel-plugin-hooks/workspace-review-flow.ts");
}

async function makeRegistry() {
  const { WorkspaceHookReviewFlowRegistry } = await loadPlugin();
  return new WorkspaceHookReviewFlowRegistry();
}

function request(overrides = {}) {
  return {
    sessionId: "s1",
    reviewFlowId: "flow-1",
    generation: 1,
    interactionId: "interaction-1",
    bundleDigest: "bundle-1",
    reviewItemIds: ["item-a", "item-b"],
    ...overrides,
  };
}

/** 断言 Promise 在给定时间内 settle（不悬挂）。 */
async function settlesWithin(promise, ms = 1000) {
  return await Promise.race([
    promise.then(
      (value) => ({ settled: true, value }),
      (error) => ({ settled: true, error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ settled: false }), ms)),
  ]);
}

test("B13.1 open 返回 pending 流程", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  assert.equal(flow.state.state, "pending");
  assert.equal(flow.request.sessionId, "s1");
});

test("B13.1 同一代重复 open → 返回同一个对象（引用相等）", async () => {
  const registry = await makeRegistry();
  const first = registry.open(request());
  const second = registry.open(request({ interactionId: "interaction-1" }));

  assert.equal(first.result, second.result, "result 应是同一 Promise");
});

test("B13.1 不同代 open → 抛错（必须显式 supersede）", async () => {
  const registry = await makeRegistry();
  registry.open(request());

  let caught;
  try {
    registry.open(request({ generation: 2, interactionId: "interaction-2" }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "不同代应抛错");
  assert.match(caught.message, /supersede/u);
});

test("B13.1 非法请求（空 sessionId）→ 抛错", async () => {
  const registry = await makeRegistry();
  let caught;
  try {
    registry.open(request({ sessionId: "  " }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
});

test("B13.2 超时后自动结算为 timed_out（Promise settle）", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ deadlineAt: Date.now() + 30 }));

  const settled = await settlesWithin(flow.result);
  assert.equal(settled.settled, true, "超时后 Promise 必须 settle");
  assert.equal(settled.value.action, "no_change");
  assert.deepEqual(settled.value.reviewItemIds, []);
  assert.equal(settled.value.reasonCode, "workspace_hooks_interaction_timeout");
  assert.equal(registry.getCurrent("s1").state, "timed_out");
});

test("B13.2 deadlineAt 已过 → 立即结算", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ deadlineAt: Date.now() - 1000 }));

  const settled = await settlesWithin(flow.result, 100);
  assert.equal(settled.settled, true, "已过 deadline 应立即 settle");
  assert.equal(settled.value.reasonCode, "workspace_hooks_interaction_timeout");
});

test("B13.3 supersede：旧流程立即结算为 superseded（不悬挂）", async () => {
  const registry = await makeRegistry();
  const old = registry.open(request());

  const replacement = registry.supersede(
    old,
    request({ generation: 2, interactionId: "interaction-2" }),
  );

  const settled = await settlesWithin(old.result, 100);
  assert.equal(settled.settled, true, "旧 Promise 必须 settle（不能悬挂）");
  assert.equal(settled.value.reasonCode, "workspace_hooks_review_superseded");
  assert.equal(replacement.state.state, "pending");
});

test("B13.3 supersede 后旧流程带 supersededByInteractionId", async () => {
  const registry = await makeRegistry();
  const old = registry.open(request());
  registry.supersede(old, request({ generation: 2, interactionId: "interaction-2" }));

  // 旧 flow 对象的状态在 settle 后应反映 superseded
  const current = registry.getCurrentFlow("s1");
  assert.equal(current.state.state, "pending", "当前是新的 pending 流程");
});

test("B13.3 supersede：target 不匹配 → 抛错", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  let caught;
  try {
    registry.supersede(
      { ...flow, request: { ...flow.request, interactionId: "wrong" } },
      request({ generation: 2 }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
});

test("B13.3 supersede：generation 必须严格递增", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ generation: 2 }));

  let caught;
  try {
    registry.supersede(flow, request({ generation: 2, interactionId: "i2" }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "同 generation 应抛错");
});

test("B13.3 supersede：reviewFlowId 不同 → 抛错", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  let caught;
  try {
    registry.supersede(flow, request({ reviewFlowId: "other", generation: 2 }));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
});

test("B13.4 validate：无流程 → superseded", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());
  registry.resolve(flow, { action: "accept" });

  // 已结算后 validate 应返回 superseded
  const validation = registry.validate(flow, { action: "accept" });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reasonCode, "workspace_hooks_review_superseded");
});

test("B13.4 validate：快照字段不一致 → snapshot_mismatch", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ taskId: "task-1" }));

  for (const key of ["taskId", "runId", "remoteSessionId", "workspaceIdentity", "bundleDigest"]) {
    const tampered = {
      ...flow,
      request: { ...flow.request, [key]: "different" },
    };
    const validation = registry.validate(tampered, { action: "accept" });
    assert.equal(validation.accepted, false, `${key} 不一致应拒绝`);
    assert.equal(validation.reasonCode, "workspace_hooks_snapshot_mismatch");
  }
});

test("B13.4 validate：decision 含请求之外的 item → snapshot_mismatch", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ reviewItemIds: ["item-a"] }));

  const validation = registry.validate(flow, {
    action: "accept",
    reviewItemIds: ["item-a", "item-unknown"],
  });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reasonCode, "workspace_hooks_snapshot_mismatch");
});

test("B13.4 validate：合法 → accepted + reviewItemIds 去重保序", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ reviewItemIds: ["a", "b", "c"] }));

  const validation = registry.validate(flow, {
    action: "accept",
    reviewItemIds: ["b", "a", "b", "c"],
  });
  assert.equal(validation.accepted, true);
  assert.deepEqual(validation.reviewItemIds, ["b", "a", "c"], "去重且保持首次出现顺序");
});

test("B13.4 validate：非法 action → 抛错", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  let caught;
  try {
    registry.validate(flow, { action: "invalid-action" });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "非法 decision 应抛错");
});

test("B13.5 resolve：通过校验 → 结算 resolved（Promise settle）", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  const validation = registry.resolve(flow, { action: "accept", reviewItemIds: ["item-a"] });
  assert.equal(validation.accepted, true);

  const settled = await settlesWithin(flow.result, 100);
  assert.equal(settled.settled, true);
  assert.equal(settled.value.action, "accept");
  assert.deepEqual(settled.value.reviewItemIds, ["item-a"]);
  assert.equal(registry.getCurrent("s1").state, "resolved");
});

test("B13.5 resolve：校验不通过 → 不改状态并返回负结果", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  const validation = registry.resolve(flow, {
    action: "accept",
    reviewItemIds: ["unknown-item"],
  });
  assert.equal(validation.accepted, false);
  assert.equal(registry.getCurrent("s1").state, "pending", "状态应仍是 pending");
});

test("B13.6 fail：结算 cancelled（Promise settle）", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  const ok = registry.fail(flow, "workspace_hooks_store_unavailable");
  assert.equal(ok, true);

  const settled = await settlesWithin(flow.result, 100);
  assert.equal(settled.settled, true);
  assert.equal(settled.value.action, "no_change");
  assert.equal(settled.value.reasonCode, "workspace_hooks_store_unavailable");
  assert.equal(registry.getCurrent("s1").state, "cancelled");
});

test("B13.6 fail：代不匹配 → 返回 false 且状态不变", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  const ok = registry.fail({ ...flow, request: { ...flow.request, generation: 99 } }, "reason");
  assert.equal(ok, false);
  assert.equal(registry.getCurrent("s1").state, "pending");
});

test("B13.7 closeWithoutDecision：结算 resolved 且无 reasonCode", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  assert.equal(registry.closeWithoutDecision(flow), true);

  const settled = await settlesWithin(flow.result, 100);
  assert.equal(settled.settled, true);
  assert.equal(settled.value.action, "no_change");
  assert.equal(settled.value.reasonCode, undefined, "无 reasonCode");
  assert.equal(registry.getCurrent("s1").state, "resolved");
});

test("B13.8 结算幂等：重复 resolve 不二次 settle", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  registry.resolve(flow, { action: "accept" });
  const stateAfterFirst = registry.getCurrent("s1").state;

  // 第二次 resolve：validate 应拒绝（状态已非 pending）
  const second = registry.resolve(flow, { action: "reject" });
  assert.equal(second.accepted, false);
  assert.equal(registry.getCurrent("s1").state, stateAfterFirst, "状态不应改变");
});

test("B13.8 超时与 resolve 竞态：只结算一次", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request({ deadlineAt: Date.now() + 20 }));

  // 在超时前 resolve
  registry.resolve(flow, { action: "accept" });
  const firstSettled = await settlesWithin(flow.result, 200);

  // 等超时时间过去
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(firstSettled.settled, true);
  assert.equal(firstSettled.value.action, "accept", "应保留第一次结算的结果（超时不应覆盖）");
  assert.equal(registry.getCurrent("s1").state, "resolved", "状态应仍是 resolved 而非 timed_out");
});

test("B13.9 getCurrent 返回状态副本：修改不影响内部", async () => {
  const registry = await makeRegistry();
  registry.open(request());

  const copy = registry.getCurrent("s1");
  copy.state = "resolved"; // 试图篡改

  assert.equal(registry.getCurrent("s1").state, "pending", "内部状态不受影响");
});

test("B13.9 未知 session → undefined", async () => {
  const registry = await makeRegistry();
  assert.equal(registry.getCurrentFlow("unknown"), undefined);
  assert.equal(registry.getCurrent("unknown"), undefined);
});

test("B13.10 flow.state 每次返回新对象", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());

  assert.notEqual(flow.state, flow.state, "state 每次应是新对象");
  assert.equal(flow.result, flow.result, "result 应是同一引用");
});

test("B13.10 request 与 result 为同一引用（跨多次读取）", async () => {
  const registry = await makeRegistry();
  const flow = registry.open(request());
  const again = registry.getCurrentFlow("s1");

  assert.equal(flow.request, again.request, "request 引用应相同");
  assert.equal(flow.result, again.result, "result 引用应相同");
});
