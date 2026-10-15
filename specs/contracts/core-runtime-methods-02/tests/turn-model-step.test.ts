// SPDX-License-Identifier: Apache-2.0
// A 区契约测试：回合模型步编排（B32–B37）+ 序列 S1/S2/S5。序列断言走 gate 握手样式（journal
// 次序），无 sleep、无固定超时；用例名与 README 对照表逐字一致（发布后不改）。
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
  buildTurnModelRequest,
  stepStartPart,
  completedAssistantFields,
  recoveryFields,
} = await methods("turn-model-step-fields");
const {
  querySourceForTask,
  findLatestCommittedAssistantUsage,
  recordMainTurnModelUsage,
} = await methods("turn-model-step-usage");
const {
  logTurnModelDiagnostics,
  persistedFailure,
  prepareFailureFacts,
} = await methods("turn-model-step-records");
const { recoverTurnModelContext } = await methods("turn-model-step-recovery");
const { performModelStep } = await methods("turn-model-step-operation");
const { runModelBackedTurnStep } = await methods("turn-model-step");

const harness = () => {
  const clock = createFakeClock();
  const journal = new Journal();
  const runtime = createFakeRuntime({ clock, journal });
  const state = createState();
  return { clock, journal, runtime, state };
};

const stepOptions = () => ({
  messages: [{ role: "user", content: "【虚构】用户输入" }],
  sourceEntries: [undefined],
  recordedMessages: [{ role: "user", content: "【虚构】用户输入" }],
  requestEntries: [],
  tools: [],
});

test("B32 回合模型步入口与遥测收尾", async () => {
  const { journal, runtime, state } = harness();
  const outcome = await runModelBackedTurnStep.call(runtime as never, state as never, stepOptions() as never);
  assert.equal(outcome, "break");
  journal.assertSubsequence(["persist.assistant", "model.request", "telemetry"]);
  const telemetry = journal.ofKind("telemetry");
  assert.equal(telemetry.at(-1)?.outcome, "completed");
  assert.equal(telemetry.at(-1)?.reason, "turn_completed");
});

test("B33 模型步执行主流程（六路错误序）", async () => {
  const { journal, runtime, state } = harness();
  const outcome = await performModelStep(
    runtime as never,
    state as never,
    stepOptions() as never,
    "assistant_b33" as never,
  );
  assert.equal(outcome, "break");
  // 成功序（S2 内核）：诊断日志 → 文本分部 → ModelComplete 事件 → usage 记账。
  journal.assertSubsequence([
    "log.steering",
    "persist.assistant",
    "persist.part",
    "create.event",
    "append.event",
    "model.request",
    "persist.part",
    "persist.part",
    "persist.assistant",
  ]);
  assert.equal(state.modelStepCount, 1);
  assert.equal(state.modelResponse, "【虚构】模型回复正文");
});

test("B34 诊断与失败记录（KD-2 观察面）", () => {
  const { journal, runtime, state } = harness();
  const result = scriptedResult() as never;
  logTurnModelDiagnostics(
    runtime as never,
    state.turnTraceContext as never,
    result,
    (result as { usage: unknown }).usage as never,
    "stop",
    10,
    [] as never,
  );
  const diag = journal.ofKind("log.info").find((mark) => mark.message === "Model response diagnostics");
  assert.ok(diag);
  assert.deepEqual(diag.providerMetadataKeys, ["vendor", "recoveredFromStreamFailure"]);
  const facts = prepareFailureFacts(new Error("【虚构】失败"), state as never);
  const shape = persistedFailure(new Error("【虚构】失败"), facts);
  assert.equal(shape.name, "Error");
  assert.equal(shape.data.message, "【虚构】失败");
  assert.equal(Object.hasOwn(shape.data, "turnResult"), false);
});

test("B35 请求/分部/收尾字段构造", () => {
  const { runtime, state } = harness();
  const request = buildTurnModelRequest(runtime as never, state as never, stepOptions() as never, {
    assistantMessageId: "assistant_b35" as never,
    model: state.model as never,
    modelTraceContext: state.turnTraceContext as never,
    normalBudget: 8192,
    contextWindow: 32000,
    streamRecovery: undefined,
    coordinator: {
      recordReasoningDelta: () => {},
      recordTextDelta: () => {},
      accept: () => {},
    } as never,
    onStreamSnapshot: (() => {}) as never,
    onModelNetworkStatus: (() => {}) as never,
  });
  assert.deepEqual(Object.keys(request), [
    "abortSignal",
    "assistantMessageId",
    "events",
    "maxOutputTokens",
    "latestRealUserMessageIndex",
    "messages",
    "sourceEntries",
    "model",
    "onStreamSnapshot",
    "onModelNetworkStatus",
    "onStreamReasoningDelta",
    "onStreamTextDelta",
    "onStreamToolCall",
    "streamRecovery",
    "tools",
    "traceContext",
  ]);
  const part = stepStartPart(runtime as never, "assistant_b35" as never);
  assert.equal(part.type, "step-start");
  const done = completedAssistantFields(
    {
      latestAssistantMessageId: undefined,
      latestAssistantTurnId: undefined,
      latestConversationMessageId: undefined,
    } as never,
    1000,
    "assistant_b35" as never,
    state.turnTraceContext as never,
    scriptedResult() as never,
  );
  assert.equal(done.includeEmptyAssistant, false);
  assert.deepEqual(recoveryFields("assistant_b35" as never, undefined, state.turnTraceContext as never), {
    assistantMessageId: "assistant_b35",
    traceContext: state.turnTraceContext,
  });
});

test("B36 主回合用量记账", async () => {
  const { runtime, state } = harness();
  assert.equal(querySourceForTask("subagent_child" as never), "subagent");
  assert.equal(querySourceForTask("workflow_child" as never), "workflow_child");
  assert.equal(querySourceForTask("nested_workflow_child" as never), "workflow_child");
  assert.equal(querySourceForTask("interactive" as never), "main_turn");
  assert.equal(findLatestCommittedAssistantUsage([]), undefined);
  // 记账委托（usage 四方法门槛缺失时静默）；不抛即为契约。
  await recordMainTurnModelUsage(runtime as never, state as never, {
    assistantMessageId: "assistant_b36" as never,
    model: state.model as never,
    modelTraceContext: state.turnTraceContext as never,
    networkEventStartIndex: 0,
    result: scriptedResult() as never,
    startedAt: 1000,
    status: "completed",
  });
});

test("B37 反应式上下文恢复", async () => {
  const { runtime, state } = harness();
  const first = await recoverTurnModelContext(
    runtime as never,
    state as never,
    new Error("【虚构】超窗"),
    0,
    [],
  );
  // reactiveCompactAfterContextExceeded 剧本返回 "skipped" → false；
  // 一次性旗标：同 step 再调即 false（不重复尝试）。
  assert.equal(first, false);
  assert.equal(state.reactiveCompactAttemptedInCurrentModelStep, true);
  const second = await recoverTurnModelContext(
    runtime as never,
    state as never,
    new Error("【虚构】超窗"),
    0,
    [],
  );
  assert.equal(second, false);
});

test("S1 模型步请求持久化序列", async () => {
  const { journal, runtime, state } = harness();
  await performModelStep(runtime as never, state as never, stepOptions() as never, "assistant_s1" as never);
  journal.assertSubsequence([
    "log.steering",
    "persist.assistant",
    "persist.part",
    "create.event",
    "append.event",
    "model.request",
  ]);
  const started = journal.kinds().indexOf("log.steering");
  const requested = journal.kinds().indexOf("model.request");
  assert.ok(started < requested);
});

test("S2 模型步成功收尾序列", async () => {
  const { journal, runtime, state } = harness();
  await performModelStep(runtime as never, state as never, stepOptions() as never, "assistant_s2" as never);
  journal.assertSubsequence([
    "model.request",
    "persist.part",
    "create.event",
    "append.event",
    "persist.part",
    "persist.assistant",
  ]);
  const events = journal.ofKind("append.event").map((mark) => mark.type);
  assert.deepEqual(events, ["model_request", "model_complete"]);
});

test("S5 紧凑恢复序列", async () => {
  const { journal, runtime, state } = harness();
  state.reactiveCompactAttemptedInCurrentModelStep = true;
  const blocked = await recoverTurnModelContext(
    runtime as never,
    state as never,
    new Error("【虚构】超窗"),
    2,
    [],
  );
  assert.equal(blocked, false);
  // 一次性旗标命中即短路：不再进入判定与压缩调用。
  assert.equal(journal.kinds().includes("log.warn"), false);
});
