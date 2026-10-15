// SPDX-License-Identifier: Apache-2.0
// D/E 区契约测试：模型选择（B38）、输出续写（B40）、step-finish（B41）、停止收尾（B49）、
// guide 排空（B50）、嵌套用量（B51）、compact 编排（B52）+ 序列 S4 + 双金样 + KD-1/KD-2。
// 金样断言按录制 json（16 键序/13 marks/rewind 落账形状）；用例名与 README 对照表逐字一致。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  Journal,
  createFakeClock,
  createFakeRuntime,
  createState,
  scriptedResult,
} from "./fixtures.js";
import { methods, coreModule } from "./entry.mjs";

const { createTurnModel, sameModelSelection, persistRuntimeModelSelection } =
  await methods("turn-model");
const {
  classifyOutputTokenContinuation,
  isOutputTokenLimitFinishReason,
  OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE,
} = await methods("turn-output-token-continuation");
const { persistToolModelStepFinish } = await methods("turn-step-finish");
const { persistCompletedAssistantStep, finishModelStepWithoutToolCalls } =
  await methods("turn-stop");
const { drainInlineGuideForNextRequest } = await methods("turn-guide-drain");
const { emitNestedModelUsageEvents } = await methods("turn-nested-model-usage");
const { executeManualCompact, autoCompactIfNeeded, estimateCurrentModelInputTokens } =
  await methods("compact");
const { logTurnModelDiagnostics } = await methods("turn-model-step-records");
const { performModelStep } = await methods("turn-model-step-operation");
const { persistWorkspaceFileRewindEntry } = await coreModule(
  "runtime/methods/workspace-checkpoint-persistence",
);

const golden = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

const harness = () => {
  const clock = createFakeClock();
  const journal = new Journal();
  const runtime = createFakeRuntime({ clock, journal });
  const state = createState();
  return { clock, journal, runtime, state };
};

test("B38 回合模型句柄与提交侧模型选择", async () => {
  const { journal, runtime } = harness();
  assert.equal(
    sameModelSelection(
      { providerId: "a", modelId: "m", options: { reasoningLevel: "low" } },
      { providerId: "a", modelId: "m", options: { reasoningLevel: "low" } },
    ),
    true,
  );
  assert.equal(
    sameModelSelection(
      { providerId: "a", modelId: "m" },
      { providerId: "a", modelId: "m", options: { reasoningLevel: "high" } },
    ),
    false,
  );
  // 选择持久化：sessionStore 缺 saveSessionEntry 时静默返回（不抛）。
  await persistRuntimeModelSelection(
    runtime as never,
    {
      providerId: "fictional",
      modelId: "model_test",
    } as never,
  );
  assert.equal(journal.marks.length, 0);
  const model = createTurnModel(runtime as never, {
    selection: { providerId: "fictional", modelId: "model_test" } as never,
  });
  assert.equal(model.providerId, "fictional");
});

test("B40 输出 token 续写", () => {
  assert.equal(
    OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE,
    "The model's response exceeded the output token maximum.",
  );
  assert.equal(isOutputTokenLimitFinishReason("length", undefined), true);
  assert.equal(isOutputTokenLimitFinishReason("stop", "max_tokens"), true);
  assert.equal(isOutputTokenLimitFinishReason("stop", "model_context_window_exceeded"), true);
  assert.equal(isOutputTokenLimitFinishReason("stop", undefined), false);
  assert.equal(
    classifyOutputTokenContinuation({
      finishReason: "length",
      rawFinishReason: undefined,
      toolCallCount: 0,
      continuationCount: 2,
    }),
    "continue",
  );
  assert.equal(
    classifyOutputTokenContinuation({
      finishReason: "length",
      rawFinishReason: undefined,
      toolCallCount: 0,
      continuationCount: 3,
    }),
    "exhausted",
  );
  assert.equal(
    classifyOutputTokenContinuation({
      finishReason: "length",
      rawFinishReason: undefined,
      toolCallCount: 1,
      continuationCount: 0,
    }),
    "none",
  );
});

test("B41 工具步收尾持久化", async () => {
  const { journal, runtime, state } = harness();
  await persistToolModelStepFinish(runtime as never, state as never, {
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_b41" as never,
    modelTraceContext: state.turnTraceContext as never,
    result: scriptedResult() as never,
  });
  journal.assertSubsequence(["persist.part", "persist.assistant"]);
  await assert.rejects(
    () =>
      persistToolModelStepFinish(
        runtime as never,
        { ...state, model: undefined } as never,
        {
          assistantCreatedAt: 1000,
          assistantMessageId: "assistant_b41" as never,
          modelTraceContext: state.turnTraceContext as never,
          result: scriptedResult() as never,
        } as never,
      ),
    /Model-backed turn step finish requires the loop Model/,
  );
});

test("B49 停止收尾与助手持久化", async () => {
  const { journal, runtime, state } = harness();
  const outcome = await finishModelStepWithoutToolCalls.call(runtime as never, state as never, {
    assistantPersistenceAnchor: {
      latestAssistantMessageId: undefined,
      latestAssistantTurnId: undefined,
      latestConversationMessageId: undefined,
    },
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_b49" as never,
    modelTraceContext: state.turnTraceContext as never,
    result: scriptedResult() as never,
  });
  assert.equal(outcome, "break");
  journal.assertSubsequence(["persist.part", "persist.assistant"]);
  assert.equal(state.historyRoundCount, 1);
  assert.ok(state.stableProductStartMessageId);
  assert.ok(state.stableBoundaryAssistantMessageId);
  const discarded = await persistCompletedAssistantStep(runtime as never, state as never, {
    assistantPersistenceAnchor: {
      latestAssistantMessageId: undefined,
      latestAssistantTurnId: undefined,
      latestConversationMessageId: undefined,
    },
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_b49_empty" as never,
    includeEmptyAssistant: false,
    modelTraceContext: state.turnTraceContext as never,
    result: { finishReason: "stop", text: "", usage: {} } as never,
  });
  assert.equal(discarded, false);
});

test("B50 步边界 guide 排空", async () => {
  const { runtime, state } = harness();
  const drained = await drainInlineGuideForNextRequest(runtime as never, state as never);
  assert.equal(drained, false);
  assert.equal(state.drainedSteerForNextRequest, undefined);
});

test("B51 嵌套模型用量事件", async () => {
  const { journal, runtime } = harness();
  const events: unknown[] = [];
  await emitNestedModelUsageEvents(runtime as never, {
    events: events as never,
    results: [
      { output: { modelUsage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } } },
      { output: "无用量" },
    ] as never,
    traceContext: createState().turnTraceContext as never,
  });
  assert.equal(events.length, 1);
  const created = journal.ofKind("create.event")[0];
  assert.equal(created.payload.stopReason, "tool_internal");
  assert.equal(created.payload.toolCallCount, 0);
});

test("B52 compact 编排组", async () => {
  const { journal, runtime, state } = harness();
  const skipped = await autoCompactIfNeeded.call(
    runtime as never,
    state.turnTraceContext as never,
    state.events as never,
    state.turnAbortSignal,
    {
      compactReason: "auto",
      modelStepIndex: 0,
      phase: "turn",
      rapidRefill: { consecutiveRapidRefills: 0, shouldBlock: false, toolTurnsSinceCompact: 0 },
      model: state.model as never,
      turnRequestState: state.turnRequestState as never,
    } as never,
  );
  assert.equal(skipped, "skipped");
  const estimate = estimateCurrentModelInputTokens([
    { role: "user", content: "【虚构】" },
  ] as never);
  assert.equal(typeof estimate, "number");
  const manual = await executeManualCompact.call(
    runtime as never,
    "【虚构】/compact",
    undefined,
    "turn_manual" as never,
    state.turnTraceContext as never,
    state.turnAbortSignal,
    undefined,
    state.model as never,
  );
  assert.equal(typeof manual.response, "string");
  journal.assertSubsequence(["log.info", "create.event", "append.event"]);
});

test("S4 停止收尾序列", async () => {
  const { journal, runtime, state } = harness();
  await finishModelStepWithoutToolCalls.call(runtime as never, state as never, {
    assistantPersistenceAnchor: {
      latestAssistantMessageId: undefined,
      latestAssistantTurnId: undefined,
      latestConversationMessageId: undefined,
    },
    assistantCreatedAt: 1000,
    assistantMessageId: "assistant_s4" as never,
    modelTraceContext: state.turnTraceContext as never,
    result: scriptedResult() as never,
  });
  // commit 判定 → step-finish 分部 → 消息收尾 → stable 对（只在 break 前）。
  journal.assertSubsequence(["persist.part", "persist.assistant"]);
  assert.equal(state.activeTurn?.steerable ?? undefined, undefined);
});

test("模型步往返金样", async () => {
  const g = golden("model-step-roundtrip.json");
  const { journal, runtime, state } = harness();
  await performModelStep(
    runtime as never,
    state as never,
    {
      messages: [{ role: "user", content: "【虚构】用户输入" }],
      sourceEntries: [undefined],
      recordedMessages: [{ role: "user", content: "【虚构】用户输入" }],
      requestEntries: [],
      tools: [],
    } as never,
    "assistant_golden" as never,
  );
  const request = journal.ofKind("model.request")[0];
  assert.deepEqual(request.keys, g.modelRequest.keys);
  const counts = (kind: string) => journal.ofKind(kind).length;
  assert.equal(counts("persist.assistant"), 2);
  assert.equal(counts("persist.part"), 3);
  assert.deepEqual(
    journal.ofKind("append.event").map((mark) => mark.type),
    ["model_request", "model_complete"],
  );
});

test("KD-1 rewind 成功落账载荷金样", async () => {
  const g = golden("rewind-success-payload.json");
  const saved: unknown[] = [];
  const runtime = {
    sessionStore: {
      saveSessionEntry: async (entry: unknown) => {
        saved.push(entry);
      },
    },
  };
  await persistWorkspaceFileRewindEntry(
    runtime as never,
    {
      id: "event_rewind",
      type: "workspace_file_rewind_triggered",
      timestamp: new Date(1000),
      sessionId: "session_rec",
      traceId: "trace_rec",
      turnId: "turn_rec",
      sequenceNumber: 7,
      payload: {
        rewindId: "rw_rec",
        scope: "workspace",
        strategy: "file_only",
        reason: "file_summary_rewind",
        targetMessageId: "msg_rec",
      },
    } as never,
    createState().turnTraceContext as never,
  );
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], g.saved[0].entry);
});

test("KD-2 providerMetadata.recoveredFromStreamFailure 观察面", () => {
  const { journal, runtime, state } = harness();
  logTurnModelDiagnostics(
    runtime as never,
    state.turnTraceContext as never,
    scriptedResult() as never,
    scriptedResult().usage as never,
    "stop",
    10,
    [] as never,
  );
  const withFlag = journal
    .ofKind("log.info")
    .find((mark) => mark.message === "Model response diagnostics");
  assert.ok(withFlag);
  assert.ok(withFlag.providerMetadataKeys.includes("recoveredFromStreamFailure"));
  const journal2 = new Journal();
  const runtime2 = createFakeRuntime({ clock: createFakeClock(), journal: journal2 });
  logTurnModelDiagnostics(
    runtime2 as never,
    state.turnTraceContext as never,
    scriptedResult({ providerMetadata: { vendor: "fictional" } }) as never,
    scriptedResult().usage as never,
    "stop",
    10,
    [] as never,
  );
  const withoutFlag = journal2
    .ofKind("log.info")
    .find((mark) => mark.message === "Model response diagnostics");
  assert.ok(withoutFlag);
  assert.equal(withoutFlag.providerMetadataKeys.includes("recoveredFromStreamFailure"), false);
});
