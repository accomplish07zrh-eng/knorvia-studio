// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-background 的后台生命周期与失败分流。
// 注入假 runExploreAgent + 事件出口 spy，断言「谁被调用、调用几次、注册表终态」。
import assert from "node:assert/strict";
import { test } from "node:test";

import { backgroundWorker } from "../src/subagent/runner-background.js";
import { isTerminalRuntimeTask } from "../src/runtime-task/registry.js";
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

type FakeInput = { onSessionReady?: () => Promise<void> };

const harness = (runtime: (input: FakeInput) => Promise<unknown>) => {
  const events: unknown[] = [];
  const notifications: unknown[] = [];
  const state = createState({
    emitParentEvent: (event: unknown) => {
      events.push(event);
    },
    enqueueParentTaskNotification: (input: unknown) => {
      notifications.push(input);
    },
    profiles: [],
    runExploreAgent: runtime,
  } as never);
  const execution = createExecution(state, request, profile);
  registerExecution(state, execution, true);
  return { events, execution, notifications, state };
};

test("backgroundWorker：任务已是终态时直接返回，但 onSettled 仍被调用", async () => {
  let runtimeCalls = 0;
  let settled = 0;
  const { execution, state } = harness(async () => {
    runtimeCalls += 1;
    return { status: "ok" };
  });
  state.registry.update(execution.agentId, (task) => ({ ...task, status: "completed" }));
  await backgroundWorker(
    state,
    execution,
    {} as never,
    async () => undefined,
    undefined,
    () => {
      settled += 1;
    },
  );
  assert.equal(runtimeCalls, 0, "终态任务不应再启动子会话");
  assert.equal(settled, 1, "无论成败都必须收尾");
});

test("backgroundWorker：就绪前失败走 onSetupFailure，且不标失败终态", async () => {
  let setupFailures = 0;
  let settled = 0;
  const { execution, state } = harness(async () => {
    throw new Error("child down");
  });
  await backgroundWorker(
    state,
    execution,
    {} as never,
    async () => undefined,
    () => {
      setupFailures += 1;
    },
    () => {
      settled += 1;
    },
  );
  assert.equal(setupFailures, 1, "就绪前失败交给 onSetupFailure");
  assert.equal(settled, 1);
  const task = state.registry.get(execution.agentId);
  assert.equal(isTerminalRuntimeTask(task), false, "就绪前失败不改注册表终态（由调用方处理）");
});

test("backgroundWorker：就绪后失败走 failBackground（任务落终态）并收尾一次", async () => {
  let setupFailures = 0;
  let settled = 0;
  const { events, execution, state } = harness(async (input) => {
    await input.onSessionReady?.();
    throw new Error("child died after ready");
  });
  await backgroundWorker(
    state,
    execution,
    {} as never,
    async () => undefined,
    () => {
      setupFailures += 1;
    },
    () => {
      settled += 1;
    },
  );
  assert.equal(setupFailures, 0, "就绪后失败不再走 setup 失败分支");
  assert.equal(settled, 1);
  const task = state.registry.get(execution.agentId);
  assert.equal(isTerminalRuntimeTask(task), true, "就绪后失败必须把任务落终态");
  assert.ok(events.length > 0, "就绪后失败应发布事件（失败路径可见）");
});

test("backgroundWorker：正常完成时任务落终态、发事件并入队通知，收尾一次", async () => {
  let settled = 0;
  const { events, execution, notifications, state } = harness(async (input) => {
    await input.onSessionReady?.();
    return {
      content: [{ text: "done" }],
      totalDurationMs: 1,
      totalTokens: 2,
      totalToolUseCount: 3,
      usage: { input: 1, output: 1 },
    };
  });
  await backgroundWorker(
    state,
    execution,
    {} as never,
    async () => undefined,
    undefined,
    () => {
      settled += 1;
    },
  );
  assert.equal(settled, 1);
  const task = state.registry.get(execution.agentId);
  assert.equal(isTerminalRuntimeTask(task), true, "正常完成后任务应是终态");
  assert.ok(events.length > 0, "完成应发布事件");
  assert.ok(notifications.length > 0, "完成应入队父任务通知");
});
