// SPDX-License-Identifier: Apache-2.0
// 内部单测（合同未覆盖项）：runner-state 的状态机迁移表。
import assert from "node:assert/strict";
import { test } from "node:test";

import { isTerminalRuntimeTask } from "../src/runtime-task/registry.js";
import {
  backgroundOutput,
  createExecution,
  createState,
  errorText,
  registerExecution,
  withoutMessages,
} from "../src/subagent/runner-state.js";

const profile = {
  description: "d",
  name: "Explore",
  source: "built-in",
  systemPrompt: "",
} as never;
const request = {
  agentType: "Explore",
  description: "find things",
  parentToolCallId: "tool-1",
  prompt: "look around",
  sessionId: "sess-1",
  trace: { traceId: "trace-1" },
  turnId: "turn-1",
  workingDirectory: "/work",
  workspaceRoot: "/work",
} as never;

test("createState：内置档案齐备、控制器与借用集合为空、参数透传", () => {
  const state = createState({ autoBackgroundMs: 1500, profiles: [] } as never);
  assert.deepEqual(state.profiles.map((entry) => entry.name).sort(), [
    "Explore",
    "general-purpose",
  ]);
  assert.equal(state.controllers.size, 0);
  assert.equal(state.borrowed.size, 0);
  assert.equal(state.autoBackgroundMs, 1500);
  assert.ok(state.registry);
});

test("createExecution：agentId 可注入，产物路径成组，恢复路径沿用旧身份", () => {
  const state = createState({ createAgentId: () => "agent-fixed", profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  assert.equal(execution.agentId, "agent-fixed");
  assert.ok(execution.childSessionId.includes("subagent_agent-fixed"));
  assert.ok(execution.metadataFile.endsWith("metadata.json"));
  assert.ok(execution.taskOutputFile.endsWith("task.output"));
  assert.ok(execution.startedAt instanceof Date);
  const resumed = createExecution(state, request, profile, {
    agentId: execution.agentId,
    childSessionId: execution.childSessionId,
    outputFile: execution.outputFile,
  } as never);
  assert.equal(resumed.agentId, execution.agentId);
  assert.equal(resumed.childSessionId, execution.childSessionId);
  assert.equal(resumed.outputFile, execution.outputFile);
});

test("registerExecution：注册即迁移到 running，字段一致且非终态", () => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  registerExecution(state, execution, true);
  const task = state.registry.get(execution.agentId);
  assert.ok(task);
  assert.equal(task.taskId, execution.agentId);
  assert.equal(task.agentType, "Explore");
  assert.equal(task.childSessionId, execution.childSessionId);
  assert.equal(task.isBackgrounded, true);
  assert.equal(task.outputFile, execution.outputFile);
  assert.equal(task.parentToolCallId, "tool-1");
  assert.equal(isTerminalRuntimeTask(task), false);
});

test("registerExecution：前台与后台只差 isBackgrounded", () => {
  const state = createState({ profiles: [] } as never);
  const foreground = createExecution(state, request, profile);
  const background = createExecution(state, request, profile);
  registerExecution(state, foreground, false);
  registerExecution(state, background, true);
  assert.equal(state.registry.get(foreground.agentId)?.isBackgrounded, false);
  assert.equal(state.registry.get(background.agentId)?.isBackgrounded, true);
});

test("backgroundOutput：形状与键序固定（status/isAsync/身份/提示词）", () => {
  const state = createState({ profiles: [] } as never);
  const execution = createExecution(state, request, profile);
  const output = backgroundOutput(execution);
  assert.deepEqual(Object.keys(output).slice(0, 4), ["status", "isAsync", "agentId", "agentType"]);
  assert.equal(output.status, "async_launched");
  assert.equal(output.isAsync, true);
  assert.equal(output.agentId, execution.agentId);
  assert.equal(output.description, "find things");
  assert.equal(output.prompt, "look around");
});

test("withoutMessages / errorText：原样透传非任务快照，错误文本三种形态", () => {
  const stripped = withoutMessages({ messages: [1], status: "running", taskId: "t" } as never);
  assert.deepEqual(
    (stripped as { messages?: unknown }).messages,
    [1],
    "非任务快照形态时原样返回（记录实测行为）",
  );
  assert.equal((stripped as { taskId?: string }).taskId, "t");
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText("plain"), "plain");
  assert.equal(errorText(42), "42");
});
