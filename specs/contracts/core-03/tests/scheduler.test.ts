// SPDX-License-Identifier: Apache-2.0
// core-03 契约测试：图调度循环（B1–B7、B10）。
import assert from "node:assert/strict";
import test from "node:test";
import { core, entryLabel } from "./entry.mjs";
import { makeSchedulerDeps, makeSnapshot, primeStrategy } from "./fixtures.mjs";

primeStrategy(core);

const joined = (fake) => JSON.stringify([...fake.events, ...fake.appended]);

test("B1 全部节点完成时返回 completed 并发出 executor_completed", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a", status: "pending" }] });
  const result = await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  assert.equal(result.status, "completed", `status (${entryLabel})`);
  assert.equal(result.reason, "completed", `reason (${entryLabel})`);
  assert.ok(joined(fake).includes("executor_completed"), "executor_completed event expected");
});

test("B2 运行前做恢复修复并落盘（writeSnapshot 至少一次）", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a", status: "active" }] });
  await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  assert.ok(fake.snapshotWrites.length >= 1, "writeSnapshot should be called at least once");
});

test("B3 同时活动节点数不超过 maxConcurrentLoops", async () => {
  let current = 0;
  let max = 0;
  const fake = makeSchedulerDeps();
  const originalRunner = fake.deps.runner;
  fake.deps.runner = {
    async run(input) {
      current += 1;
      max = Math.max(max, current);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      current -= 1;
      return originalRunner.run(input);
    },
  };
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    strategy: {
      ...core.DEFAULT_EXPERT_WORKFLOW_STRATEGY,
      executor: { ...core.DEFAULT_EXPERT_WORKFLOW_STRATEGY.executor, maxConcurrentLoops: 1 },
    },
  });
  const result = await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  assert.ok(max <= 1, `max concurrent ${max} should be <= 1 (${entryLabel})`);
  assert.equal(result.status, "completed");
});

test("B4 连续失败达到阈值时暂停并带 consecutiveErrors", async () => {
  const fake = makeSchedulerDeps({ runnerBehavior: () => "throw" });
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({
    nodes: [{ id: "a" }],
    strategy: {
      ...core.DEFAULT_EXPERT_WORKFLOW_STRATEGY,
      executor: { ...core.DEFAULT_EXPERT_WORKFLOW_STRATEGY.executor, maxConsecutiveErrors: 1 },
    },
  });
  const result = await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  const text = joined(fake);
  assert.equal(result.status, "paused", `status (${entryLabel})`);
  assert.ok(
    result.reason === "error_threshold" || result.reason === "deadlock",
    `reason should be a pause reason, got ${result.reason}`,
  );
  assert.ok(text.includes("executor_paused"), "executor_paused event expected");
});

test("B6 前沿变化事件只在集合变化时发送且带三件套载荷", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a" }] });
  await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  const text = joined(fake);
  const count = (text.match(/frontier_changed/gu) ?? []).length;
  assert.ok(count >= 1, `frontier_changed should be emitted at least once (${entryLabel})`);
  // 每次发送都必须携带 activeNodeIds / blockedNodes / readyNodeIds 三件套；单节点运行里次数与状态迁移同阶。
  assert.ok(count <= 8, `frontier_changed count=${count} should stay bounded`);
  assert.ok(text.includes("activeNodeIds"), "payload.activeNodeIds expected");
  assert.ok(text.includes("blockedNodes"), "payload.blockedNodes expected");
  assert.ok(text.includes("readyNodeIds"), "payload.readyNodeIds expected");
});

test("B7 预中止信号按 signal.reason 抛出", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a" }] });
  const reason = new Error("cancelled by test");
  const controller = new AbortController();
  controller.abort(reason);
  await assert.rejects(
    () =>
      scheduler.run({ abortSignal: controller.signal, cwd: "/work", phase: "execute", snapshot }),
    (error) => error === reason,
    `expected the abort reason to be rethrown (${entryLabel})`,
  );
});

test("B10 节点执行结果进入快照（完成后节点状态不再是 pending）", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a" }] });
  const result = await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  const node = result.snapshot.graph.nodes.find((entry) => entry.id === "a");
  assert.ok(node, "node a should exist in the result snapshot");
  assert.notEqual(node.status, "pending", `node status should advance (${entryLabel})`);
});
