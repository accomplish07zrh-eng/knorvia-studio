// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-cancellation 的就绪闸门与取消语义。
import assert from "node:assert/strict";
import { test } from "node:test";

import { controllerFor, readinessGate } from "../src/subagent/runner-cancellation.js";
import { createExecution, createState } from "../src/subagent/runner-state.js";

const profile = {
  description: "d",
  name: "Explore",
  source: "built-in",
  systemPrompt: "",
} as never;
const request = {
  agentType: "Explore",
  description: "d",
  parentToolCallId: "tool-1",
  prompt: "p",
  sessionId: "sess-1",
  trace: { traceId: "trace-1" },
  turnId: "turn-1",
  workingDirectory: "/work",
  workspaceRoot: "/work",
} as never;

test("readinessGate：只结算一次（resolve 后再 reject 无效）", async () => {
  const gate = readinessGate();
  let settled = 0;
  void gate.promise.then(() => {
    settled += 1;
  });
  gate.resolve();
  gate.resolve();
  gate.reject(new Error("late"));
  await gate.promise;
  await Promise.resolve();
  assert.equal(settled, 1);
});

test("readinessGate：reject 后以同一错误拒绝，后续 resolve 无效", async () => {
  const gate = readinessGate();
  const failure = new Error("setup failed");
  gate.reject(failure);
  gate.resolve();
  await assert.rejects(gate.promise, (error: unknown) => error === failure);
});

test("controllerFor：登记 → dispose 释放（幂等）", () => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  const { controller, dispose } = controllerFor(state, execution);
  assert.equal(state.controllers.get(execution.agentId), controller);
  dispose();
  assert.equal(state.controllers.has(execution.agentId), false);
  dispose();
  assert.equal(state.controllers.has(execution.agentId), false);
});

test("controllerFor：abort 传播 reason；不同执行互不影响", () => {
  const state = createState({ profiles: [] } as never);
  const first = createExecution(state, request, profile);
  const second = createExecution(state, request, profile);
  const a = controllerFor(state, first);
  const b = controllerFor(state, second);
  const reason = new Error("cancelled by test");
  assert.equal(a.controller.signal.aborted, false);
  a.controller.abort(reason);
  assert.equal(a.controller.signal.aborted, true);
  assert.equal(a.controller.signal.reason, reason);
  assert.equal(b.controller.signal.aborted, false);
});
