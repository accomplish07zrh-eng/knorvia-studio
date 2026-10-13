// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-stop 的停止请求守卫与状态迁移（running → killed）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { isTerminalRuntimeTask } from "../src/runtime-task/registry.js";
import { stopMethod } from "../src/subagent/runner-stop.js";
import { createExecution, createState, registerExecution } from "../src/subagent/runner-state.js";

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

const withRegisteredTask = (background = true) => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  registerExecution(state, execution, background);
  return { execution, state };
};

test("stopMethod：未知 taskId 返回 undefined（不动注册表）", async () => {
  const { state } = withRegisteredTask();
  const stop = stopMethod(state);
  const result = await stop("does-not-exist", {});
  assert.equal(result, undefined);
});

test("stopMethod：已 abort 的 signal 直接抛出其原因", async () => {
  const { execution, state } = withRegisteredTask();
  const stop = stopMethod(state);
  const reason = new Error("stop aborted");
  await assert.rejects(
    stop(execution.agentId, { signal: AbortSignal.abort(reason) }),
    (error: unknown) => error === reason,
  );
});

test("stopMethod：后台任务缺少通知出口时，停止抛出不变量错误（不静默丢通知）", async () => {
  const { execution, state } = withRegisteredTask(true);
  const stop = stopMethod(state);
  await assert.rejects(stop(execution.agentId, {}), /not enqueued/u);
  const after = state.registry.get(execution.agentId);
  assert.ok(after, "抛错后任务仍在注册表（未被静默改写）");
  assert.equal(isTerminalRuntimeTask(after), false);
});

test("stopMethod：停止任何运行中任务都必须先入队通知（前后台一致，否则抛错且不改状态）", async () => {
  for (const background of [false, true]) {
    const { execution, state } = withRegisteredTask(background);
    const stop = stopMethod(state);
    await assert.rejects(stop(execution.agentId, {}), /not enqueued/u);
    const after = state.registry.get(execution.agentId);
    assert.ok(after, `background=${background}：抛错后任务仍在注册表`);
    assert.equal(
      isTerminalRuntimeTask(after),
      false,
      `background=${background}：未入队通知时不得把任务改成终态`,
    );
  }
});
