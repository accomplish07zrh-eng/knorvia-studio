// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-publication 的事件发布顺序与通知入队守卫。
import assert from "node:assert/strict";
import { test } from "node:test";

import { SessionEventType } from "@knorvia/contracts";

import {
  emit,
  emitExecutionCompleted,
  enqueueNotification,
} from "../src/subagent/runner-publication.js";
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

const spyState = () => {
  const events: Array<{ payload: unknown; type: unknown }> = [];
  const notifications: string[] = [];
  const state = createState({
    emitParentEvent: (event: { payload: unknown; type: unknown }) => {
      events.push({ payload: event.payload, type: event.type });
    },
    enqueueParentTaskNotification: (input: { text?: string }) => {
      notifications.push(input.text ?? "");
    },
    profiles: [],
  } as never);
  const execution = createExecution(state, request, profile);
  return { events, execution, notifications, state };
};

test("emit：把事件投给父会话出口，类型与载荷原样透传（按调用顺序）", async () => {
  const { events, execution, state } = spyState();
  await emit(state, execution, SessionEventType.ToolCallStarted, { toolCallId: "tc-1" });
  await emit(state, execution, SessionEventType.ToolCallResult, { toolCallId: "tc-1", ok: true });
  assert.equal(events.length, 2);
  assert.equal(events[0]!.type, SessionEventType.ToolCallStarted);
  assert.deepEqual(events[0]!.payload, { toolCallId: "tc-1" });
  assert.equal(events[1]!.type, SessionEventType.ToolCallResult);
  assert.deepEqual(events[1]!.payload, { toolCallId: "tc-1", ok: true });
});

test("emitExecutionCompleted：非终态任务不发事件（守卫）", async () => {
  const { events, execution, state } = spyState();
  registerExecution(state, execution, true);
  const running = state.registry.get(execution.agentId)!;
  await emitExecutionCompleted(state, execution, running);
  assert.equal(events.length, 0, "运行中的任务不应触发完成事件");
});

test("emitExecutionCompleted：终态任务发 BackgroundTaskCompleted", async () => {
  const { events, execution, state } = spyState();
  registerExecution(state, execution, true);
  state.registry.update(execution.agentId, (task) => ({ ...task, status: "completed" }));
  const completed = state.registry.get(execution.agentId)!;
  await emitExecutionCompleted(state, execution, completed);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, SessionEventType.BackgroundTaskCompleted);
});

test("enqueueNotification：有出口时入队一次，重复入队被去重", () => {
  const { execution, notifications, state } = spyState();
  registerExecution(state, execution, true);
  enqueueNotification(state, execution.agentId, "任务完成", execution.runTrace);
  enqueueNotification(state, execution.agentId, "任务完成", execution.runTrace);
  assert.equal(notifications.length, 1, "同一 agent 的通知只入队一次");
  assert.equal(notifications[0], "任务完成");
});

test("enqueueNotification：没有出口时不抛（只记日志），不影响调用方", () => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  assert.doesNotThrow(() =>
    enqueueNotification(state, execution.agentId, "任务完成", execution.runTrace),
  );
});
