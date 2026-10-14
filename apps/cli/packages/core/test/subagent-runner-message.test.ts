// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-message 的投递守卫与排队语义。
// 断言用「结果 JSON 包含关键片段」，避免依赖未公开的结果字段名。
import assert from "node:assert/strict";
import { test } from "node:test";

import { messageMethod } from "../src/subagent/runner-message.js";
import { createExecution, createState, registerExecution } from "../src/subagent/runner-state.js";

const profile = {
  description: "d",
  name: "Explore",
  source: "built-in",
  systemPrompt: "",
} as never;
const runRequest = {
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

const sendRequest = (to: string) =>
  ({
    message: "hello",
    parentToolCallId: "tool-1",
    summary: "s",
    to,
    trace: { traceId: "trace-1" },
  }) as never;

const stateWithRunningTask = () => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, runRequest, profile);
  registerExecution(state, execution, true);
  return { execution, state };
};

test("messageMethod：signal 已 abort 时返回失败结果（不抛），错误里带目标", async () => {
  const { execution, state } = stateWithRunningTask();
  const send = messageMethod(state);
  const result = await send(sendRequest(execution.agentId), {
    signal: AbortSignal.abort(),
  });
  const text = JSON.stringify(result);
  assert.match(text, /aborted/u);
  assert.match(text, new RegExp(execution.agentId, "u"));
});

test("messageMethod：目标不存在时返回失败结果（带目标名）", async () => {
  const { state } = stateWithRunningTask();
  const send = messageMethod(state);
  const result = await send(sendRequest("no-such-agent"), {});
  const text = JSON.stringify(result);
  assert.match(text, /No active local_agent task found/u);
  assert.match(text, /no-such-agent/u);
});

test("messageMethod：运行中且无 messageSink 时排队投递（结果为 queued）", async () => {
  const { execution, state } = stateWithRunningTask();
  const send = messageMethod(state);
  const result = await send(sendRequest(execution.agentId), {});
  const text = JSON.stringify(result);
  assert.match(text, /queued/u);
  const queued = state.registry.get(execution.agentId)?.pendingMessages ?? [];
  assert.equal(queued.length, 1, "排队后任务上应留下一条待投递消息");
  assert.equal(queued[0]?.isMeta, true);
  assert.equal(queued[0]?.message, "hello");
});

test("messageMethod：messageSink 抛错时降级为排队（不打断调用方）", async () => {
  const { execution, state } = stateWithRunningTask();
  const task = state.registry.get(execution.agentId)!;
  state.registry.update(execution.agentId, (current) => ({
    ...current,
    messageSink: {
      send: () => {
        throw new Error("sink down");
      },
    },
  }));
  assert.ok(task, "任务存在");
  const send = messageMethod(state);
  const result = await send(sendRequest(execution.agentId), {});
  assert.match(JSON.stringify(result), /queued/u);
  assert.equal(
    (state.registry.get(execution.agentId)?.pendingMessages ?? []).length,
    1,
    "sink 失败后消息应留在队列里",
  );
});

test("messageMethod：messageSink 成功时透传其结果，不入队", async () => {
  const { execution, state } = stateWithRunningTask();
  state.registry.update(execution.agentId, (current) => ({
    ...current,
    messageSink: { send: () => "delivered-ok" },
  }));
  const send = messageMethod(state);
  const result = await send(sendRequest(execution.agentId), {});
  assert.match(JSON.stringify(result), /delivered-ok/u);
  assert.equal(
    (state.registry.get(execution.agentId)?.pendingMessages ?? []).length,
    0,
    "成功投递不应留下待投递消息",
  );
});
