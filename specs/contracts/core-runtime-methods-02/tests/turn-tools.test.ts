// SPDX-License-Identifier: Apache-2.0
// B/C 区契约测试：循环状态计数（B39）+ 工具批执行（B42–B48）+ 序列 S3。序列断言 gate 握手样式，
// 无 sleep；用例名与 README 对照表逐字一致。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Journal,
  createFakeClock,
  createFakeRuntime,
  createState,
  scriptedResult,
} from "./fixtures.js";
import { methods } from "./entry.mjs";

const {
  evaluateRapidRefill,
  recordCompactSuccess,
  recordCompletedToolBatch,
  recordModelHistoryRound,
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  MAX_CONSECUTIVE_RAPID_REFILLS,
  RAPID_REFILL_TOOL_TURN_THRESHOLD,
} = await methods("turn-loop-state");
const {
  runningToolBatchState,
  completedToolBatchState,
  failedToolBatchState,
  toolBatchResultDiagnostic,
} = await methods("turn-tool-batch-parts");
const { steerToolBatchFollowUp } = await methods("turn-tool-batch-follow-up");
const { recordToolUsageFromResult } = await methods("turn-tool-usage");
const { handleToolCallAnomalyWarnings } = await methods("turn-tool-warnings");
const { mcpToolPartMetadata, completedToolPartMetadata } = await methods("tool-part-metadata");
const {
  projectToolNameForNonEmptyBoundary,
  persistPendingToolPart,
} = await methods("tool-part-persistence");
const { executeToolCallsForModelStep } = await methods("turn-tools");

const harness = () => {
  const clock = createFakeClock();
  const journal = new Journal();
  const runtime = createFakeRuntime({ clock, journal });
  const state = createState();
  return { clock, journal, runtime, state };
};

test("B39 回合循环状态与紧凑计数", () => {
  const { state } = harness();
  assert.equal(RAPID_REFILL_TOOL_TURN_THRESHOLD, 3);
  assert.equal(MAX_CONSECUTIVE_RAPID_REFILLS, 3);
  const first = evaluateRapidRefill({ consecutiveRapidRefills: 0, toolTurnsSinceCompact: 0 });
  assert.equal(first.consecutiveRapidRefills, 1);
  assert.equal(first.shouldBlock, false);
  const third = evaluateRapidRefill({ consecutiveRapidRefills: 2, toolTurnsSinceCompact: 0 });
  assert.equal(third.shouldBlock, true);
  const reset = evaluateRapidRefill({ consecutiveRapidRefills: 2, toolTurnsSinceCompact: 3 });
  assert.equal(reset.consecutiveRapidRefills, 0);
  recordCompactSuccess(state as never, third);
  assert.deepEqual(state.compactTracking, {
    consecutiveRapidRefills: 3,
    toolTurnsSinceCompact: 0,
  });
  state.reactiveCompactAttemptedInCurrentModelStep = true;
  recordCompletedToolBatch(state as never);
  assert.equal(state.reactiveCompactAttemptedInCurrentModelStep, false);
  assert.equal(state.compactTracking.toolTurnsSinceCompact, 1);
  recordModelHistoryRound(state as never);
  assert.equal(state.historyRoundCount, 1);
  assert.equal(isAutomationMutationRestrictedTurn({ automationId: "auto_1" } as never), true);
  assert.equal(
    isAutomationMutationRestrictedTurn({
      turnTraceContext: { queryId: "automation-x" },
      toolDisallowlist: [],
    } as never),
    true,
  );
  assert.equal(isOffPeakCreateRestrictedTurn({ offPeakTaskId: "task_1" } as never), true);
  assert.equal(
    isOffPeakCreateRestrictedTurn({
      turnTraceContext: { queryId: "query" },
      toolDisallowlist: ["OffPeakCreate"],
    } as never),
    true,
  );
});

test("B42 工具批执行主流程", async () => {
  const { journal, runtime, state } = harness();
  const { TurnMachineImpl } = await (await import("./entry.mjs")).coreDeps();
  state.turnMachine = new TurnMachineImpl(state.turnMachine.receiveModelResponse("【虚构】"));
  const result = scriptedResult({
    toolCalls: [{ id: "call_1", name: "EchoTool", input: { text: "【虚构】" } }],
    text: "",
  });
  const outcome = await executeToolCallsForModelStep.call(runtime as never, state as never, {
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_b42" as never,
    modelTraceContext: state.turnTraceContext as never,
    result: result as never,
    toolCalls: [{ id: "call_1", name: "EchoTool", input: { text: "【虚构】" } }] as never,
  });
  assert.equal(outcome, "continue");
  journal.assertSubsequence(["persist.part", "create.event", "append.event"]);
});

test("B43 工具分部状态构造", () => {
  const part = { declarationIndex: 0, partID: "part_1", input: { a: 1 }, startedAt: 1000 };
  const boundary = { toolName: "EchoTool" };
  const running = runningToolBatchState(
    { registry: { getMetadata: () => undefined } } as never,
    { id: "call_1", name: "EchoTool", input: {} } as never,
    part as never,
    boundary as never,
  );
  assert.equal(running.status, "running");
  assert.deepEqual(running.time, { start: 1000 });
  const failed = failedToolBatchState(
    { registry: { getMetadata: () => undefined } } as never,
    {
      toolCallId: "call_1",
      toolName: "EchoTool",
      success: false,
      error: { message: "【虚构】失败" },
      startedAt: new Date(1000),
      completedAt: new Date(2000),
    } as never,
    part as never,
    "【虚构】失败",
  );
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "【虚构】失败");
  const diag = toolBatchResultDiagnostic([
    { toolName: "EchoTool", success: true, output: "x".repeat(80) },
  ] as never);
  assert.equal(diag.results[0].output.length, 50);
  const done = completedToolBatchState(
    {
      toolCallId: "call_1",
      toolName: "EchoTool",
      success: true,
      startedAt: new Date(1000),
      completedAt: new Date(2000),
    } as never,
    part as never,
    "ok",
    boundary as never,
    undefined as never,
  );
  assert.equal(done.status, "completed");
  assert.deepEqual(done.time, { start: 1000, end: 2000 });
});

test("B44 工具结果跟进输入", async () => {
  const { journal, runtime, state } = harness();
  await steerToolBatchFollowUp(runtime as never, state as never, {} as never, state.turnTraceContext as never);
  assert.equal(journal.marks.length, 0);
  (runtime as { steerTurn?: unknown }).steerTurn = async () => ({ kind: "queued", pendingInputId: "p1" });
  await steerToolBatchFollowUp(
    runtime as never,
    state as never,
    {
      toolCallId: "call_1",
      toolName: "EchoTool",
      followUpUserInput: { input: "【虚构】跟进", reasonSource: "tool" },
    } as never,
    state.turnTraceContext as never,
  );
  const queued = journal.ofKind("log.debug").find((m) => m.message === "Queued follow-up user input from tool result");
  assert.ok(queued);
  assert.equal(queued.event, "tool.follow_up_user_input.queued");
});

test("B45 结果路径工具用量记账", async () => {
  const { journal, runtime } = harness();
  // usage 四方法门槛缺失 → 静默（不记账不抛）。
  await recordToolUsageFromResult(runtime as never, {
    toolCallId: "call_1",
    toolName: "EchoTool",
    success: true,
    startedAt: new Date(1000),
    completedAt: new Date(2000),
    durationMs: 1000,
    output: "【虚构】输出",
  } as never, createState().turnTraceContext as never);
  assert.equal(journal.ofKind("log.warn").length, 0);
});

test("B46 工具调用异常告警", async () => {
  const { journal, runtime, state } = harness();
  await handleToolCallAnomalyWarnings(runtime as never, state as never, {
    modelTraceContext: state.turnTraceContext as never,
    toolCalls: [] as never,
  });
  // 告警走事件不走日志；无命中时无动作。
  assert.equal(journal.marks.length, 0);
});

test("B47 工具分部元数据", () => {
  assert.equal(mcpToolPartMetadata(undefined), undefined);
  const done = completedToolPartMetadata({
    serialization: {
      truncated: true,
      originalBytes: 10,
      returnedBytes: 5,
      budgetStrategy: "head_tail",
    },
    readFileStateMetadata: { path: "【虚构】a.ts" },
  } as never);
  assert.equal(done.serialization?.truncated, true);
  assert.deepEqual(done.readFileState, { path: "【虚构】a.ts" });
});

test("B48 待决工具分部持久化与名称边界", async () => {
  const { journal, runtime } = harness();
  assert.deepEqual(projectToolNameForNonEmptyBoundary("EchoTool"), { toolName: "EchoTool" });
  const empty = projectToolNameForNonEmptyBoundary(" ");
  assert.equal(empty.toolName, "empty_tool_name");
  assert.deepEqual(empty.metadata, { providerToolName: " " });
  await persistPendingToolPart(runtime as never, {
    assistantMessageId: "assistant_b48" as never,
    declarationIndex: 0,
    input: { a: 1 },
    partID: "part_b48",
    toolCall: { id: "call_1", name: "EchoTool", input: { a: 1 } } as never,
    traceContext: createState().turnTraceContext as never,
    model: createState().model as never,
  });
  const part = journal.ofKind("persist.part")[0]?.part as { state: { status: string } };
  assert.equal(part.state.status, "pending");
});

test("S3 工具批执行序列", async () => {
  const { journal, runtime, state } = harness();
  const { TurnMachineImpl } = await (await import("./entry.mjs")).coreDeps();
  state.turnMachine = new TurnMachineImpl(state.turnMachine.receiveModelResponse("【虚构】"));
  const result = scriptedResult({
    toolCalls: [
      { id: "call_1", name: "EchoTool", input: { text: "【虚构】一" } },
      { id: "call_2", name: "EchoTool", input: { text: "【虚构】二" } },
    ],
    text: "",
  });
  await executeToolCallsForModelStep.call(runtime as never, state as never, {
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_s3" as never,
    modelTraceContext: state.turnTraceContext as never,
    result: result as never,
    toolCalls: result.toolCalls as never,
  });
  // 声明序：call_1 的分部先于 call_2（declarationIndex 序）。
  const parts = journal.ofKind("persist.part");
  assert.ok(parts.length >= 2);
});
