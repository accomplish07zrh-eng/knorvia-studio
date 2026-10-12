// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：agent 组 2（A4–A6 turn-machine 的事件序列断言）。
// 全部为同步状态推进：没有 sleep、没有超时、没有真实 I/O；事件序列即"方法调用 → 返回的新状态"。
//
// 实测冻结的语义（初版按直觉写错，已按实测改正；quirk 另见 known-differences.md）：
// 1) 阶段机**没有 streaming 自环**：`receiveModelResponse`/`addStreamingContent` 只能从 `awaiting_model_response`
//    调用一次，第二次抛 `Cannot transition from streaming to streaming`；多次到达的流式内容由调用方在状态外累积。
// 2) `decideToolCalls` 只在 `deny` 时改调用状态（→ `permission_denied`）；`allow` **保持** `waiting_permission`。
// 3) `startToolExecution` 会把**所有非等待调用重标为 `running`**（含已 completed/failed/denied 的），因此它必须在
//    完成工具**之前**调用；`completeTool`/`resolvePermission` 都只 `project()`，不改阶段。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const agent = await loadFile("agent/index");
const { TurnMachineImpl } = agent;

const createMachine = () => TurnMachineImpl.create("session-1", 1, "hi", "trace-1", "turn-1");
const advance = (state) => new TurnMachineImpl(state);

test("A4 turn-machine：正常回合的阶段推进序列（方法返回新状态）", () => {
  let machine = createMachine();
  assert.equal(machine.state.phase, "idle");
  assert.equal(machine.isComplete(), false);

  const started = machine.start();
  assert.equal(started.phase, "processing_input");
  assert.equal(machine.state.phase, "idle", "方法不修改接收者，返回新状态");

  machine = advance(started);
  const requesting = machine.startModelRequest("gpt", [{ role: "user", content: "hi" }]);
  assert.equal(requesting.phase, "awaiting_model_response");
  assert.deepEqual(requesting.modelRequest, {
    model: "gpt",
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(
    advance(requesting).getNextPhase(),
    "awaiting_model_response",
    "非流式/执行阶段保持原阶段",
  );

  const streaming = advance(requesting).receiveModelResponse("hello");
  assert.equal(streaming.phase, "streaming");
  assert.equal(streaming.streamingContent, "hello");
  assert.throws(
    () => advance(streaming).addStreamingContent(" world"),
    /Cannot transition from streaming to streaming/,
    "阶段机没有 streaming 自环：一次模型响应只允许一次内容写入",
  );
  assert.throws(
    () => advance(streaming).receiveModelResponse("more"),
    /Cannot transition from streaming to streaming/,
  );

  assert.equal(advance(streaming).getNextPhase(), "completing", "有内容且无工具调用 → 收尾");

  const completed = advance(streaming).complete("final answer");
  assert.equal(completed.phase, "completing");
  assert.equal(completed.finalResponse, "final answer");
  assert.equal(completed.resultType, "success");
  assert.ok(completed.completedAt instanceof Date);

  const finished = advance(completed);
  assert.equal(finished.isComplete(), true);
  assert.equal(finished.getNextPhase(), "completing", "终态不再推进");
  assert.throws(() => finished.start(), /Cannot transition from completing to processing_input/);

  const emptyStream = { ...streaming, streamingContent: "", toolCalls: [] };
  assert.equal(advance(emptyStream).getNextPhase(), "streaming", "无内容无工具调用时停在流式阶段");
  const withCalls = {
    ...streaming,
    toolCalls: [{ id: "c1", name: "Read", input: {}, status: "scheduled" }],
  };
  assert.equal(
    advance(withCalls).getNextPhase(),
    "scheduling_tools",
    "流式后有工具调用 → 调度阶段",
  );
});

test("A5 turn-machine：非法转移与失败收尾的错误形态", () => {
  const idle = createMachine();
  assert.throws(
    () => idle.startModelRequest("gpt", []),
    (error) => {
      assert.match(String(error.message), /Must be in ProcessingInput or AggregatingResults phase/);
      assert.equal(error.recoverable, true);
      return true;
    },
    "idle 阶段不能直接发起模型请求",
  );

  const started = advance(idle.start());
  assert.throws(
    () => started.start(),
    /Cannot transition from processing_input to processing_input/,
  );
  assert.throws(
    () => started.aggregateResults(),
    /Cannot transition from processing_input to aggregating_results/,
  );

  const failed = started.fail({ type: "boom", message: "exploded", recoverable: false });
  assert.equal(failed.phase, "error");
  assert.deepEqual(failed.error, { type: "boom", message: "exploded", recoverable: false });
  assert.ok(failed.completedAt instanceof Date);
  assert.equal(advance(failed).isComplete(), true);
  assert.equal(advance(failed).getNextPhase(), "error");
});

test("A6 turn-machine：工具调度、权限等待/裁决、工具结算与待处理输入", () => {
  let machine = advance(createMachine().start());
  machine = advance(machine.startModelRequest("gpt", []));
  machine = advance(machine.receiveModelResponse("planning"));

  const calls = [
    { id: "c1", name: "Read", input: { path: "/a" } },
    { id: "c2", name: "Bash", input: { command: "ls" } },
  ];
  const schedule = { items: [], parallelGroups: [["c1", "c2"]], executionOrder: ["c1", "c2"] };
  const scheduled = machine.scheduleTools(calls, schedule);
  assert.equal(scheduled.phase, "scheduling_tools");
  assert.deepEqual(scheduled.scheduledTools, schedule);
  assert.deepEqual(
    scheduled.toolCalls.map((call) => [call.id, call.status]),
    [
      ["c1", "scheduled"],
      ["c2", "scheduled"],
    ],
  );

  const executing = advance(scheduled).startToolExecution();
  assert.equal(executing.phase, "executing_tools", "没有等待权限的调用就直接执行");
  assert.deepEqual(
    executing.toolCalls.map((call) => call.status),
    ["running", "running"],
  );

  const waiting = advance(executing).requestPermission({
    toolCallId: "c2",
    toolName: "Bash",
    riskLevel: "high",
    requestedAt: new Date(),
  });
  assert.equal(waiting.phase, "awaiting_permission");
  assert.equal(waiting.toolCalls.find((call) => call.id === "c2").status, "waiting_permission");
  assert.equal(waiting.pendingPermissions.length, 1);
  assert.equal(
    waiting.toolCalls.find((call) => call.id === "c1").status,
    "running",
    "其它调用不受影响",
  );

  const allowed = advance(waiting).resolvePermission("c2", "allow", { command: "ls -la" });
  assert.equal(allowed.phase, "awaiting_permission", "裁决不改阶段");
  assert.equal(allowed.pendingPermissions.length, 0, "裁决后从待处理里移除");
  assert.equal(allowed.resolvedPermissions.length, 1);
  assert.equal(allowed.resolvedPermissions[0].decision, "allow");
  assert.deepEqual(allowed.resolvedPermissions[0].modifiedInput, { command: "ls -la" });
  assert.ok(allowed.resolvedPermissions[0].resolvedAt instanceof Date);
  assert.equal(
    allowed.toolCalls.find((call) => call.id === "c2").status,
    "waiting_permission",
    "allow 只改输入、不改状态（只有 deny 改状态）",
  );
  assert.equal(allowed.toolCalls.find((call) => call.id === "c2").input.command, "ls -la");

  const denied = advance(waiting).resolvePermission("c2", "deny");
  assert.equal(denied.toolCalls.find((call) => call.id === "c2").status, "permission_denied");
  assert.equal(denied.pendingPermissions.length, 0);
  assert.equal(denied.resolvedPermissions[0].decision, "deny");

  const oneDone = advance(executing).completeTool("c1", { success: true, content: "ok" });
  assert.equal(oneDone.phase, "executing_tools", "completeTool 不改阶段");
  assert.equal(oneDone.toolResults.length, 1);
  assert.equal(oneDone.toolResults[0].success, true);
  assert.equal(oneDone.toolResults[0].error, undefined);
  assert.equal(oneDone.toolCalls.find((call) => call.id === "c1").status, "completed");
  assert.equal(
    advance(oneDone).getNextPhase(),
    "executing_tools",
    "还有 running 的调用 → 停执行阶段",
  );

  const bothDone = advance(oneDone).completeTool("c2", { success: true, content: "done" });
  assert.equal(bothDone.toolResults.length, 2);
  assert.equal(bothDone.toolCalls.find((call) => call.id === "c2").status, "completed");
  assert.equal(advance(bothDone).getNextPhase(), "aggregating_results", "全部结算 → 聚合阶段");

  const aggregated = advance(bothDone).aggregateResults();
  assert.equal(aggregated.phase, "aggregating_results");
  assert.equal(
    advance(aggregated).getNextPhase(),
    "awaiting_model_response",
    "无失败调用 → 回到模型请求",
  );
  assert.equal(advance(aggregated).startModelRequest("gpt", []).phase, "awaiting_model_response");

  const failedTool = advance(executing).completeTool("c1", {
    success: false,
    content: "tool exploded",
  });
  assert.equal(failedTool.toolResults[0].success, false);
  assert.equal(failedTool.toolResults[0].error.type, "tool_error");
  assert.equal(failedTool.toolResults[0].error.message, "tool exploded");
  assert.equal(failedTool.toolResults[0].error.recoverable, true);
  const failedAggregate = { ...failedTool, phase: "aggregating_results" };
  assert.equal(advance(failedAggregate).getNextPhase(), "completing", "有失败调用 → 直接收尾");

  const queued = advance(aggregated).queuePendingInput({ text: "steer" });
  assert.deepEqual(queued.pendingInputs, [{ text: "steer" }]);
  assert.deepEqual(aggregated.pendingInputs, [], "queuePendingInput 不改接收者");
  const drained = advance(queued).drainPendingInputs();
  assert.equal(drained.inputs, queued.pendingInputs, "排空返回原数组引用");
  assert.deepEqual(drained.inputs, [{ text: "steer" }]);
  assert.deepEqual(drained.state.pendingInputs, []);
});
