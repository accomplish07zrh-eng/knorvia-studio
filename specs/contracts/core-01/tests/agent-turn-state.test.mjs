// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组 1（A1 回合阶段状态机）。入口用本区公开桶 `src/agent/index.ts`
// （包根在 tsx 下不可加载，见 known-differences.md §2）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const agent = await loadFile("agent/index");

test("A1 回合阶段状态机：取值表、初始状态与转移矩阵", () => {
  const { TurnPhase, canTransitionTo, createTurnState, isTerminalPhase, isWaitingPhase } = agent;

  assert.deepEqual(TurnPhase, {
    Idle: "idle",
    ProcessingInput: "processing_input",
    AwaitingModelResponse: "awaiting_model_response",
    Streaming: "streaming",
    SchedulingTools: "scheduling_tools",
    ExecutingTools: "executing_tools",
    AggregatingResults: "aggregating_results",
    AwaitingPermission: "awaiting_permission",
    Completing: "completing",
    Error: "error",
  });

  const state = createTurnState("turn-1", "session-1", 3, "trace-1", "hello");
  assert.equal(state.id, "turn-1");
  assert.equal(state.sessionId, "session-1");
  assert.equal(state.turnNumber, 3);
  assert.equal(state.traceId, "trace-1");
  assert.equal(state.input, "hello");
  assert.equal(state.phase, "idle");
  assert.equal(state.streamingContent, "");
  assert.equal(state.acceptsPendingInput, true);
  assert.equal(state.resultType, "success");
  assert.equal(state.attachments, undefined);
  assert.equal(state.completedAt, undefined);
  assert.ok(state.startedAt instanceof Date);
  assert.deepEqual(state.toolCalls, []);
  assert.deepEqual(state.toolResults, []);
  assert.deepEqual(state.pendingInputs, []);
  assert.deepEqual(state.pendingPermissions, []);
  assert.deepEqual(state.resolvedPermissions, []);
  assert.deepEqual(state.scheduledTools, { items: [], parallelGroups: [], executionOrder: [] });

  const attachments = [{ type: "file", path: "/w/a.ts" }];
  assert.deepEqual(createTurnState("t", "s", 1, "tr", "i", attachments).attachments, attachments);

  for (const phase of Object.values(TurnPhase)) {
    assert.equal(isTerminalPhase(phase), phase === "completing" || phase === "error", `terminal ${phase}`);
    assert.equal(
      isWaitingPhase(phase),
      ["awaiting_model_response", "awaiting_permission", "executing_tools"].includes(phase),
      `waiting ${phase}`,
    );
  }

  const expected = {
    idle: ["processing_input"],
    processing_input: ["awaiting_model_response", "completing"],
    awaiting_model_response: ["streaming", "completing", "error"],
    streaming: ["scheduling_tools", "aggregating_results", "completing", "error"],
    scheduling_tools: ["executing_tools", "awaiting_permission", "error"],
    executing_tools: ["aggregating_results", "awaiting_permission", "error"],
    aggregating_results: ["awaiting_model_response", "scheduling_tools", "completing", "error"],
    awaiting_permission: ["executing_tools", "error"],
    completing: ["idle"],
    error: ["idle"],
  };
  for (const [from, targets] of Object.entries(expected)) {
    for (const to of Object.values(TurnPhase)) {
      assert.equal(canTransitionTo(from, to), targets.includes(to), `${from} -> ${to}`);
    }
  }
  assert.equal(canTransitionTo("idle", "idle"), false, "不能原地自转");
  assert.equal(canTransitionTo("idle", "streaming"), false, "不能跳阶段");
});
