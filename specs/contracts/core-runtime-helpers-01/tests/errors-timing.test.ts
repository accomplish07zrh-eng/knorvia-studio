// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：错误归一、取消、异常提醒、流式账本事件（B28–B33），
// 以及运行时时序条要求的「模拟模型流（并发 + 压缩触发点 + 中途取消）→ 事件序列 + 持久化记录」。
// 全程不 sleep、不使用固定超时：并发交错靠 gate 握手，模型流来自现有模型适配器测试夹具。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contractDir, coreDeps, helpers } from "./entry.mjs";
import { createFakeRuntime, createLogger, eventSequence } from "./fixtures.js";

const modelFixtures =
  await import("../../../../apps/cli/packages/adapters/test/model-subsystem-contract/harness/fixtures.js");

const deps = await coreDeps();
const modelErrors = await helpers("model-errors");
const businessError = await helpers("provider-business-error");
const turnErrors = await helpers("turn-errors");
const anomaly = await helpers("model-anomaly");
const toolCallValidation = await helpers("model-tool-call-validation");
const ledger = await helpers("streaming-tool-ledger");
const compact = await helpers("compact");

const trace = { spanId: "span", traceId: "trace", turnId: "turn-seq" } as never;
const modelContext = {
  model: { modelId: "model-test", providerId: "provider-test" },
  source: "contract-test",
  traceContext: trace,
};

test("B28 上下文超限 / 媒体过大的判定链与深度上限", () => {
  assert.equal(modelErrors.isContextExceededFinishReason("length", undefined), false);
  assert.equal(
    modelErrors.isContextExceededFinishReason("context_length_exceeded", undefined),
    true,
  );
  assert.equal(modelErrors.isContextExceededFinishReason(undefined, " prompt_too_long "), true);
  assert.equal(modelErrors.isContextExceededFinishReason("stop", "max_tokens"), false);

  assert.equal(modelErrors.isModelContextExceededError({ code: "context_window_exceeded" }), true);
  assert.equal(
    modelErrors.isModelContextExceededError({ message: "The prompt is too long for the model" }),
    true,
  );
  assert.equal(
    modelErrors.isModelContextExceededError({ cause: { context: { reason: "prompt_too_long" } } }),
    true,
    "沿 cause 链下钻并识别 context.reason",
  );
  const cyclic: Record<string, unknown> = { code: "other" };
  cyclic.cause = cyclic;
  assert.equal(modelErrors.isModelContextExceededError(cyclic), false, "环形 cause 不死循环");

  assert.equal(modelErrors.isModelMediaTooLargeError({ code: "image_too_large" }), true);
  assert.equal(modelErrors.isModelMediaTooLargeError({ message: "media exceeds limit" }), true);
  assert.equal(modelErrors.isModelMediaTooLargeError({ code: "rate_limited" }), false);
  assert.equal(modelErrors.isModelMediaTooLargeError(undefined), false);

  assert.equal(modelErrors.readRawFinishReason({ rawFinishReason: "length" }), "length");
  assert.equal(modelErrors.readRawFinishReason({ rawFinishReason: 5 }), undefined);
  assert.equal(modelErrors.readRawFinishReason(undefined), undefined);

  const contextError = modelErrors.createModelContextExceededFinishError({
    finishReason: "context_length_exceeded",
    rawFinishReason: "length",
  });
  assert.equal(contextError.type, deps.CoreErrorType.ModelContextExceeded);
  assert.equal(contextError.recoverable, true);
  assert.equal(contextError.retryable, true);
  assert.equal(contextError.context.finishReason, "context_length_exceeded");

  const breaker = modelErrors.createCompactRapidRefillError({
    consecutiveRapidRefills: 3,
    maxConsecutiveRapidRefills: 3,
    toolTurnThreshold: 4,
    toolTurnsSinceCompact: 1,
  });
  assert.equal(breaker.context.reason, "compact_rapid_refill_breaker");
  assert.match(breaker.message, /Autocompact stopped because the context refilled/);
  assert.equal(breaker.context.toolTurnThreshold, 4);
});

test("B28 空响应判定、诊断与收尾抛错（含不可重试的供应商业务失败）", () => {
  assert.equal(
    modelErrors.isSuspiciousEmptyModelResult("stop", 0, 0, { outputTokens: 3 } as never),
    false,
    "正常停止不算可疑",
  );
  assert.equal(modelErrors.isSuspiciousEmptyModelResult("length", 0, 0), true);
  assert.equal(modelErrors.isSuspiciousEmptyModelResult("length", 4, 0), false, "有文本就不算空");
  assert.equal(
    modelErrors.isSuspiciousEmptyModelResult(undefined, 0, 2),
    false,
    "有工具调用不算空",
  );

  const diagnostics = modelErrors.buildSuspiciousEmptyDiagnostics({
    finishReason: "length",
    outboundHeaderKeys: ["x-a"],
    providerMetadata: { code: 429, message: "slow down", nested: { deep: true } },
    rawFinishReason: "length",
  });
  assert.equal(diagnostics.finishReason, "length");
  assert.deepEqual(diagnostics.outboundHeaderKeys, ["x-a"]);
  assert.equal(diagnostics.providerBusinessCodeFromMetadata, "429");
  assert.equal(diagnostics.providerBusinessMessageFromMetadata, "slow down");

  assert.throws(
    () =>
      modelErrors.finalizeSuspiciousEmptyModelResult({
        finishReason: "length",
        model: { modelId: "model-test", providerId: "provider-test" },
        providerMetadata: { code: 402, message: "quota exhausted" },
        rawFinishReason: "length",
      }),
    (error: { context?: Record<string, unknown>; retryable?: boolean; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.ModelError);
      assert.equal(error.context.providerCode, "402");
      assert.equal(error.retryable, false, "供应商业务失败不可自动重试");
      return true;
    },
  );

  assert.throws(
    () =>
      modelErrors.finalizeSuspiciousEmptyModelResult({
        finishReason: "length",
        model: { modelId: "model-test", providerId: "provider-test" },
        providerMetadata: undefined,
        rawFinishReason: "length",
      }),
    (error: { context?: Record<string, unknown>; message?: string; retryable?: boolean }) => {
      assert.equal(error.context.reason, "empty_model_response");
      assert.equal(error.context.suspiciousEmpty, true);
      assert.equal(error.retryable, true);
      assert.ok(error.message.startsWith("Model returned no text, no tool calls"));
      return true;
    },
  );

  assert.equal(
    modelErrors.normalizeStreamError(new Error("boom")).message,
    "boom",
    "已是 Error 原样返回",
  );
  assert.equal(modelErrors.normalizeStreamError("plain failure").message, "plain failure");
  assert.equal(
    modelErrors.normalizeStreamError({ code: 500, message: "upstream broke" }).type,
    deps.CoreErrorType.ModelError,
    "供应商业务形状的流错误归一成核心错误",
  );
});

test("B29 提供商业务错误：BFS 找到首个失败记录并归一成不可重试错误", () => {
  const failure = businessError.findProviderBusinessFailureInMetadata({
    steps: [{ ok: true }, { error: { code: 0, message: "nothing" } }],
    usage: { tokens: 3 },
  });
  assert.equal(failure, undefined, "code 0 不是失败");

  const nested = businessError.findProviderBusinessFailureInMetadata({
    items: [{ data: { providerCode: "429", providerMessage: " slow down " } }],
  });
  assert.equal(nested.providerCode, "429");
  assert.equal(nested.message, "slow down", "消息两端空白被裁掉");
  assert.equal(nested.responseBodySummary.providerCode, "429");

  const flagged = businessError.findProviderBusinessFailureInMetadata({ success: false });
  assert.equal(flagged.message, "Provider returned a business error.", "缺消息给固定兜底");

  const converted = businessError.createCoreErrorFromProviderBusinessLike({
    code: 402,
    isProviderBusinessError: true,
    message: "payment required",
  });
  assert.equal(converted.type, deps.CoreErrorType.ModelError);
  assert.equal(converted.retryable, false);
  assert.equal(converted.context.providerCode, "402");

  assert.equal(
    businessError.createCoreErrorFromProviderBusinessLike({ message: "plain" }),
    undefined,
    "没有失败特征返回 undefined",
  );
  assert.equal(businessError.createCoreErrorFromProviderBusinessLike(undefined), undefined);

  const viaContext = businessError.createCoreErrorFromProviderBusinessLike({
    context: { code: 503, message: "unavailable" },
    message: "wrapped",
  });
  assert.equal(viaContext.context.providerCode, "503");
});
test("B30 取消作用域级联、取消判定与失败映射", () => {
  const parent = new AbortController();
  const scope = turnErrors.createTurnAbortScope(parent.signal);
  assert.equal(scope.signal.aborted, false);
  parent.abort(new Error("user pressed esc"));
  assert.equal(scope.signal.aborted, true, "父信号中止即级联中止");
  assert.equal((scope.signal.reason as Error).message, "user pressed esc", "取消原因透传");
  scope.dispose();

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const earlyScope = turnErrors.createTurnAbortScope(alreadyAborted.signal);
  assert.equal(earlyScope.signal.aborted, true, "父已中止时子作用域立即为中态");
  earlyScope.dispose();

  const detached = new AbortController();
  const detachedScope = turnErrors.createTurnAbortScope(detached.signal);
  detachedScope.dispose();
  detached.abort();
  assert.equal(detachedScope.signal.aborted, false, "dispose 后不再级联");

  assert.throws(
    () => turnErrors.throwIfTurnAborted(scope.signal),
    (error: { type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.TurnCancelled);
      return true;
    },
  );
  turnErrors.throwIfTurnAborted(undefined);

  assert.equal(turnErrors.isTurnCancellationError({ name: "AbortError" }), true);
  assert.equal(turnErrors.isTurnCancellationError({ code: "MODEL_REQUEST_CANCELLED" }), true);
  assert.equal(turnErrors.isTurnCancellationError({ cause: { type: "turn_cancelled" } }), true);
  assert.equal(turnErrors.isTurnCancellationError(new Error("boom")), false);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(turnErrors.isTurnCancellationError(new Error("boom"), aborted.signal), true);

  const fault = turnErrors.createExternalTurnFaultError("E_UPSTREAM", "upstream refused");
  assert.equal(turnErrors.isTurnCancellationError(fault), false, "外部故障不算取消");
  assert.equal(
    turnErrors.isTurnCancellationError({ code: "ABORT_ERR" }, {
      aborted: true,
      reason: fault,
    } as never),
    false,
    "外部故障优先于信号中止",
  );

  const mappedFault = turnErrors.createTurnFailureError(fault, undefined, "Turn execution failed");
  assert.equal(mappedFault.type, deps.CoreErrorType.UnknownError);
  assert.equal(mappedFault.message, "upstream refused");
  assert.equal(mappedFault.recoverable, true);

  const cancelled = turnErrors.createTurnFailureError(
    { name: "AbortError" },
    undefined,
    "Turn execution failed",
  );
  assert.equal(cancelled.type, deps.CoreErrorType.TurnCancelled);

  const contextExceeded = turnErrors.createTurnFailureError(
    { code: "context_length_exceeded" },
    undefined,
    "Turn execution failed",
  );
  assert.equal(contextExceeded.type, deps.CoreErrorType.ModelContextExceeded);
  assert.equal(contextExceeded.retryable, true);

  const wrapped = turnErrors.createTurnFailureError(
    new Error("kaboom"),
    undefined,
    "Turn execution failed",
  );
  assert.equal(wrapped.type, deps.CoreErrorType.UnknownError);
  assert.equal(wrapped.message, "Turn execution failed");
  assert.equal((wrapped.cause as Error).message, "kaboom", "保留原始原因");

  const alreadyCancelled = turnErrors.createTurnCancelledError({
    type: deps.CoreErrorType.TurnCancelled,
    message: "Turn was cancelled.",
  } as never);
  assert.equal(alreadyCancelled.type, deps.CoreErrorType.TurnCancelled);
});

test("B30 回合结果事件：取消记 TurnComplete，失败记 TurnError，先落事件再打日志", async () => {
  const cancelLogger = createLogger();
  const cancelRuntime = createFakeRuntime(cancelLogger);
  const cancelEvents: unknown[] = [];
  const cancelled = turnErrors.createTurnCancelledError({ name: "AbortError" });
  await turnErrors.appendTurnOutcomeEvent(cancelRuntime.runtime, {
    coreError: cancelled,
    events: cancelEvents as never,
    durationMs: 42,
    fallbackMessage: "Turn execution failed",
    logEvent: "runtime.turn.error",
    logLabel: "Turn",
    traceContext: trace,
    turnPhase: "streaming",
    historyRoundCount: 3,
  });

  assert.deepEqual(eventSequence(cancelRuntime), [
    `${deps.SessionEventType.TurnComplete}#cancelled`,
  ]);
  const outcome = cancelRuntime.appended[0].payload as Record<string, unknown>;
  assert.equal(outcome.resultType, "cancelled");
  assert.equal(outcome.tokenCount, 0);
  assert.equal(outcome.toolCallCount, 0);
  assert.equal(outcome.duration, 42);
  assert.equal(outcome.historyRoundCount, 3);
  assert.equal(cancelEvents.length, 1, "事件同时压回调用方数组");
  assert.equal(cancelLogger.records.length, 1);
  assert.equal(cancelLogger.records[0].level, "error");
  const cancelLogContext = cancelLogger.records[0].context[1] as Record<string, unknown>;
  assert.equal(cancelLogContext.status, "cancelled");
  assert.equal(cancelLogContext.event, "runtime.turn.error");
  assert.equal(cancelLogContext.turnPhase, "streaming");

  const failLogger = createLogger();
  const failRuntime = createFakeRuntime(failLogger);
  const failure = turnErrors.createTurnFailureError(
    new Error("kaboom"),
    undefined,
    "Turn execution failed",
  );
  await turnErrors.appendTurnOutcomeEvent(failRuntime.runtime, {
    coreError: failure,
    events: [] as never,
    durationMs: 7,
    fallbackMessage: "Turn execution failed",
    logEvent: "runtime.turn.error",
    logLabel: "Turn",
    traceContext: trace,
    turnPhase: "model_request",
  });
  assert.deepEqual(eventSequence(failRuntime), [
    `${deps.SessionEventType.TurnError}#${deps.CoreErrorType.UnknownError}`,
  ]);
  const errorPayload = failRuntime.appended[0].payload as {
    error: { message: string; type: string };
    turnPhase: string;
  };
  assert.equal(errorPayload.error.type, deps.CoreErrorType.UnknownError);
  assert.equal(
    errorPayload.error.message,
    "kaboom",
    "事件负载给的是根因消息，回退文案留给上层展示",
  );
  assert.equal(failure.message, "Turn execution failed", "包装错误自身用回退文案");
  assert.equal(errorPayload.turnPhase, "model_request");
  const failLogContext = failLogger.records[0].context[1] as Record<string, unknown>;
  assert.equal(failLogContext.status, "failed");
});

test("B31 重复调用与工具预算告警：阈值、稳定签名与注入上限", () => {
  const state = { anomalyWarningsInjected: 0, repeatedToolCallStreakCount: 0 };
  const config = {
    maxBudgetWarningsPerTurn: 3,
    repeatedToolCallWarningThreshold: 3,
    toolCallWarningThreshold: 5,
  };
  const call = (name: string, input: unknown, id: string) => ({ id, input, name });

  assert.deepEqual(
    anomaly.detectRepeatedToolCallWarnings(
      [call("Read", { file_path: "/a" }, "t1")],
      state,
      config,
    ),
    [],
    "未到阈值只累计连续计数，不产出观察",
  );
  assert.equal(state.repeatedToolCallStreakCount, 1);
  anomaly.detectRepeatedToolCallWarnings([call("Read", { file_path: "/a" }, "t2")], state, config);
  assert.equal(state.repeatedToolCallStreakCount, 2);
  const third = anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { file_path: "/a" }, "t3")],
    state,
    config,
  );
  assert.equal(third.length, 1, "第 3 次正好命中阈值");
  assert.deepEqual(third[0], {
    observedCount: 3,
    threshold: 3,
    toolCallId: "t3",
    toolName: "Read",
    warningInjected: true,
  });
  assert.equal(state.anomalyWarningsInjected, 1);

  anomaly.detectRepeatedToolCallWarnings([call("Read", { file_path: "/b" }, "t4")], state, config);
  assert.equal(state.repeatedToolCallStreakCount, 1, "输入变化重置连续计数");
  assert.equal(state.anomalyWarningsInjected, 1, "重置不回收已注入的次数");

  const orderedState = { anomalyWarningsInjected: 0, repeatedToolCallStreakCount: 0 };
  anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { file_path: "/a", limit: 10 }, "t5")],
    orderedState,
    config,
  );
  const reversedState = { anomalyWarningsInjected: 0, repeatedToolCallStreakCount: 0 };
  anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { limit: 10, file_path: "/a" }, "t6")],
    reversedState,
    config,
  );
  assert.equal(
    orderedState.repeatedToolCallStreakCount,
    reversedState.repeatedToolCallStreakCount,
    "对象键顺序不影响签名（稳定序列化）",
  );

  const cappedState = { anomalyWarningsInjected: 3, repeatedToolCallStreakCount: 0 };
  anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { file_path: "/c" }, "t7")],
    cappedState,
    config,
  );
  anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { file_path: "/c" }, "t8")],
    cappedState,
    config,
  );
  const capped = anomaly.detectRepeatedToolCallWarnings(
    [call("Read", { file_path: "/c" }, "t9")],
    cappedState,
    config,
  );
  assert.equal(capped.length, 1, "命中阈值仍产出观察");
  assert.equal(capped[0].warningInjected, false, "达到每回合注入上限后不再注入");
  assert.equal(cappedState.anomalyWarningsInjected, 3, "上限之后计数不再增长");

  assert.deepEqual(
    anomaly.detectRepeatedToolCallWarnings([call("Read", {}, "t8")], state, {
      repeatedToolCallWarningThreshold: 0,
    }),
    [],
    "阈值 ≤0 关闭该告警",
  );

  const budgetState = { anomalyWarningsInjected: 0, repeatedToolCallStreakCount: 0 };
  assert.equal(
    anomaly.detectToolCallBudgetWarning(4, 1, budgetState, config),
    undefined,
    "还没跨过阈值不告警",
  );
  const crossed = anomaly.detectToolCallBudgetWarning(6, 2, budgetState, config);
  assert.deepEqual(crossed, { observedCount: 6, threshold: 5, warningInjected: true });
  assert.equal(
    anomaly.detectToolCallBudgetWarning(7, 1, budgetState, config),
    undefined,
    "已经跨过阈值不重复告警",
  );
  assert.equal(
    anomaly.detectToolCallBudgetWarning(3, 1, budgetState, undefined),
    undefined,
    "未配置阈值不告警",
  );

  assert.ok(
    anomaly
      .buildRepeatedToolCallReminderBody("Read", 3)
      .startsWith("You have called Read with the same input 3 times in a row."),
  );
  assert.ok(
    anomaly
      .buildToolCallBudgetReminderBody(6)
      .startsWith("This turn has already made 6 tool calls."),
  );
});

test("B32 工具调用名校验：空白名按「是否已被供应方执行」分流，拒绝前先打 warn", () => {
  const logger = createLogger();
  assert.equal(
    toolCallValidation.requireRuntimeToolCallName(
      { id: "t1", name: "  Read  " },
      {
        ...modelContext,
        logger,
      },
    ),
    "Read",
    "运行时侧名字先去空白",
  );
  assert.throws(
    () =>
      toolCallValidation.requireRuntimeToolCallName(
        { id: "t1", name: "   " },
        {
          ...modelContext,
          logger,
        },
      ),
    (error: { context?: Record<string, unknown>; retryable?: boolean; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.ModelError);
      assert.equal(error.retryable, false);
      assert.equal(error.context.event, "model.invalid_tool_call");
      assert.equal(error.context.toolCallId, "t1");
      return true;
    },
  );
  assert.equal(logger.records.length, 1);
  assert.equal(logger.records[0].level, "warn");
  const warnContext = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(warnContext.event, "model.invalid_tool_call");
  assert.equal(warnContext.status, "failed");
  assert.equal(warnContext.model, "provider-test/model-test");

  const normalized = toolCallValidation.normalizeModelToolCallsForRuntime(
    [
      { id: "t1", input: {}, name: " Read " },
      { id: "t2", input: {}, name: "  " },
    ],
    modelContext,
  );
  assert.equal(normalized[0].name, "Read");
  assert.equal(
    normalized[1].name,
    "  ",
    "模型侧空名只要没被供应方执行过、且带调用 id，就原样保留给运行时再判定",
  );
  assert.equal(
    toolCallValidation.normalizeModelToolCallsForRuntime(undefined, modelContext),
    undefined,
  );
  assert.equal(toolCallValidation.normalizeModelToolCallsForRuntime([], modelContext), undefined);

  const rejecting = createLogger();
  assert.throws(
    () =>
      toolCallValidation.normalizeModelToolCallsForRuntime(
        [{ id: "t3", input: {}, name: "", providerExecuted: true }],
        { ...modelContext, logger: rejecting },
      ),
    (error: { message?: string }) => {
      assert.match(error.message, /tool name is empty/);
      return true;
    },
  );
  assert.equal(rejecting.records.length, 1, "拒绝前必须打一条 warn");
});

test("B33 流式工具账本与恢复锚点：载荷、id 规则与事件顺序", async () => {
  const logger = createLogger();
  const runtime = createFakeRuntime(logger);
  runtime.registryEntries.set("Read", {
    metadata: { concurrentSafe: true, destructive: false, readOnly: true, sideEffectScope: "none" },
    permission: { sideEffectScope: "none" },
  });
  const events: Record<string, unknown>[] = [];

  const event = await ledger.emitStreamingToolLedgerUpdate(
    runtime.runtime,
    events as never,
    trace,
    {
      assistantMessageId: "msg-1" as never,
      executionTiming: "streaming",
      input: { file_path: "/a" },
      startedAt: new Date("2026-01-01T00:00:00Z"),
      status: "started",
      toolCall: { id: "call-1", name: "Read" } as never,
    },
  );
  const payload = event.payload as Record<string, unknown>;
  assert.equal(payload.attemptId, "msg-1:end-of-stream");
  assert.equal(payload.toolCallId, "call-1");
  assert.equal(payload.toolName, "Read");
  assert.equal(payload.status, "started");
  assert.equal(payload.executionTiming, "streaming");
  assert.equal(payload.readOnly, true, "readOnly = 元数据 readOnly 且作用域 none");
  assert.equal(payload.destructive, false);
  assert.equal(payload.concurrentSafe, true);
  assert.equal(payload.sideEffectScope, "none");
  assert.equal(events.length, 1, "事件压回调用方数组");
  assert.equal(logger.records.length, 0, "账本事件本身不打日志");

  const defaulted = await ledger.emitStreamingToolLedgerUpdate(
    runtime.runtime,
    events as never,
    trace,
    {
      assistantMessageId: "msg-1" as never,
      status: "completed",
      toolCall: { id: "call-2", name: "Unknown" } as never,
    },
  );
  const defaultedPayload = defaulted.payload as Record<string, unknown>;
  assert.equal(defaultedPayload.executionTiming, "end_of_stream", "缺省执行时机");
  assert.equal(defaultedPayload.readOnly, undefined, "注册表没有该工具时字段为 undefined");
  assert.equal(ledger.createStreamingToolAttemptId("msg-1" as never), "msg-1:end-of-stream");
  assert.equal(
    ledger.createStreamRecoveryAnchorId("msg-1" as never, "call-1" as never),
    "msg-1:call-1:tool-result",
  );

  const anchor = await ledger.emitStreamRecoveryAnchor(runtime.runtime, events as never, trace, {
    assistantMessageId: "msg-1" as never,
    committedAt: new Date("2026-01-01T00:00:01Z"),
    resultPartId: "part-9" as never,
    success: true,
    toolCallId: "call-1" as never,
    toolName: "Read",
  });
  const anchorPayload = anchor.payload as Record<string, unknown>;
  assert.equal(anchorPayload.anchorId, "msg-1:call-1:tool-result");
  assert.equal(anchorPayload.kind, "tool_result");
  assert.deepEqual(anchorPayload.committedToolCallIds, ["call-1"]);
  assert.equal(anchorPayload.attemptId, "msg-1:end-of-stream");

  const failedAnchor = await ledger.emitStreamRecoveryAnchor(
    runtime.runtime,
    events as never,
    trace,
    {
      assistantMessageId: "msg-1" as never,
      committedAt: new Date("2026-01-01T00:00:02Z"),
      success: false,
      toolCallId: "call-2" as never,
      toolName: "Unknown",
    },
  );
  assert.equal((failedAnchor.payload as Record<string, unknown>).kind, "tool_error");

  assert.deepEqual(
    events.map((entry) => entry.type),
    [
      deps.SessionEventType.StreamingToolLedgerUpdated,
      deps.SessionEventType.StreamingToolLedgerUpdated,
      deps.SessionEventType.StreamRecoveryAnchorCreated,
      deps.SessionEventType.StreamRecoveryAnchorCreated,
    ],
    "先账本后锚点，逐条顺序追加",
  );
  assert.deepEqual(
    runtime.appended.map((entry) => entry.type),
    events.map((entry) => entry.type),
    "持久化顺序与调用方数组一致",
  );
});

test("事件序列：模拟模型流（并发工具 + 压缩触发点 + 中途取消）", async () => {
  // 事件序列取自合同夹具 fixtures/model-stream-events.json；流本身来自现有模型适配器测试夹具。
  const scenario = JSON.parse(
    readFileSync(join(contractDir, "fixtures/model-stream-events.json"), "utf8"),
  ) as {
    assistantMessageId: string;
    expected: {
      entrySequence: string[];
      exitSequenceAfterRelease: string[];
      exitSequenceBeforeRelease: string[];
      logSequence: string[];
      observedStream: string[];
    };
    promptTooLongCause: Record<string, unknown>;
    streamEvents: Record<string, unknown>[];
  };
  const stream = modelFixtures.streamResult(scenario.streamEvents);

  const logger = createLogger();
  const runtime = createFakeRuntime(logger);
  runtime.registryEntries.set("Read", {
    metadata: { concurrentSafe: true, destructive: false, readOnly: true },
    permission: { sideEffectScope: "none" },
  });
  const parent = new AbortController();
  const scope = turnErrors.createTurnAbortScope(parent.signal);
  const persisted: Record<string, unknown>[] = [];
  const ledgerPromises: Promise<unknown>[] = [];
  const observedStream: string[] = [];
  const assistantMessageId = scenario.assistantMessageId as never;

  // 第一个账本更新会挂起（gate 握手），第二个照常完成——交错顺序完全由代码路径决定。
  const gate = runtime.gateNext();

  for await (const part of stream.fullStream as AsyncIterable<{
    type: string;
    [key: string]: unknown;
  }>) {
    observedStream.push(part.type);
    if (part.type === "tool-call-start") {
      ledgerPromises.push(
        ledger.emitStreamingToolLedgerUpdate(runtime.runtime, persisted as never, trace, {
          assistantMessageId,
          input: part.input as Record<string, unknown>,
          startedAt: new Date("2026-01-01T00:00:00Z"),
          status: "started",
          toolCall: {
            id: part.toolCallId,
            name: part.toolName,
          } as never,
        }),
      );
      continue;
    }
    if (part.type === "context-overflow") {
      // 压缩触发点：按超长错误链推进保留组数并记录重试告警（attempt 由调用方传入，无状态）。
      compact.truncateCompactSummaryRequestEntriesAfterPromptTooLong({
        attempt: 0,
        entriesForSummary: [
          { message: { content: "round-1", role: "user" } },
          { message: { content: "round-1-answer", role: "assistant" } },
          { message: { content: "round-2", role: "user" } },
          { message: { content: "round-2-answer", role: "assistant" } },
          { message: { content: "round-3", role: "user" } },
          { message: { content: "round-3-answer", role: "assistant" } },
        ] as never,
        cause: scenario.promptTooLongCause,
        logger,
        traceContext: trace,
      });
      continue;
    }
    if (part.type === "user-cancel") {
      // 中途取消：父作用域中止 → 流在下一个 await 前被判定为已取消。
      parent.abort(new Error("user pressed esc"));
      break;
    }
  }

  const cancelledError = (() => {
    try {
      turnErrors.throwIfTurnAborted(scope.signal);
      return undefined;
    } catch (error) {
      return error;
    }
  })();
  assert.ok(cancelledError, "取消点之后必须判定为已取消");
  const coreError = turnErrors.createTurnFailureError(
    cancelledError,
    scope.signal,
    "Turn execution failed",
  );
  assert.equal(coreError.type, deps.CoreErrorType.TurnCancelled);
  await turnErrors.appendTurnOutcomeEvent(runtime.runtime, {
    coreError,
    events: persisted as never,
    durationMs: 15,
    fallbackMessage: "Turn execution failed",
    logEvent: "runtime.turn.error",
    logLabel: "Turn",
    traceContext: trace,
    turnPhase: "streaming",
  });

  // 断言一：进入顺序 —— 两次账本更新先于回合结果事件。
  assert.deepEqual(observedStream, [
    "tool-call-start",
    "tool-call-start",
    "context-overflow",
    "user-cancel",
  ]);
  assert.deepEqual(eventSequence(runtime, "enter"), [
    `${deps.SessionEventType.StreamingToolLedgerUpdated}#call-a`,
    `${deps.SessionEventType.StreamingToolLedgerUpdated}#call-b`,
    `${deps.SessionEventType.TurnComplete}#cancelled`,
  ]);

  // 断言二：完成顺序 —— call-a 仍挂起时只有 call-b 与回合结果完成（并发交错，不靠计时）。
  assert.deepEqual(eventSequence(runtime, "exit"), [
    `${deps.SessionEventType.StreamingToolLedgerUpdated}#call-b`,
    `${deps.SessionEventType.TurnComplete}#cancelled`,
  ]);
  assert.equal(persisted.length, 2, "gate 未放行前只有两个事件完成持久化");

  gate.close();
  await Promise.all(ledgerPromises);
  assert.equal(persisted.length, 3, "放行后最后一条账本事件落盘");
  assert.deepEqual(eventSequence(runtime, "exit"), [
    `${deps.SessionEventType.StreamingToolLedgerUpdated}#call-b`,
    `${deps.SessionEventType.TurnComplete}#cancelled`,
    `${deps.SessionEventType.StreamingToolLedgerUpdated}#call-a`,
  ]);

  // 断言三：持久化记录内容 —— 账本载荷、回合结果载荷与 attempt id。
  const ledgerRecords = persisted.filter(
    (entry) => entry.type === deps.SessionEventType.StreamingToolLedgerUpdated,
  );
  assert.deepEqual(
    ledgerRecords.map((entry) => (entry.payload as { toolCallId: string }).toolCallId),
    ["call-b", "call-a"],
    "落盘顺序即完成顺序",
  );
  for (const record of ledgerRecords) {
    const payload = record.payload as Record<string, unknown>;
    assert.equal(payload.attemptId, "msg-stream:end-of-stream", "同一次流共用同一 attempt id");
    assert.equal(payload.status, "started");
    assert.equal(payload.executionTiming, "end_of_stream");
  }
  const outcome = persisted.find((entry) => entry.type === deps.SessionEventType.TurnComplete)!
    .payload as Record<string, unknown>;
  assert.equal(outcome.resultType, "cancelled");
  assert.equal(outcome.duration, 15);
  assert.equal(persisted[0].payload !== undefined, true, "三条持久化记录都带载荷");

  // 断言四：日志序列 —— 压缩重试告警在前，回合取消错误在后。
  const loggedEvents = logger.records.map((record) => {
    const context = record.context.find(
      (value) => value !== null && typeof value === "object" && "event" in value,
    ) as { event?: string } | undefined;
    return `${record.level}:${context?.event ?? record.message}`;
  });
  assert.deepEqual(loggedEvents, [
    "warn:compact.prompt_too_long.retry",
    "error:runtime.turn.error",
  ]);
  const retryContext = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(retryContext.attempt, 1);
  assert.equal(retryContext.maxAttempts, 3);
  assert.ok((retryContext.droppedMessages as number) > 0, "重试确实丢弃了更旧的轮次");
  const errorContext = logger.records[1].context[1] as Record<string, unknown>;
  assert.equal(errorContext.status, "cancelled");
  assert.equal(errorContext.turnPhase, "streaming");

  scope.dispose();
});
