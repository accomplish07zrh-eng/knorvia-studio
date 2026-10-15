// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：取消/流恢复/流式工具协调与执行（B13–B22）。
// 事件序列断言比对夹具 journal；并发交错一律 deferred gate 握手，无 sleep、无固定超时。
import assert from "node:assert/strict";
import test from "node:test";
import { contractsBundle, coreDeps, methods } from "./entry.mjs";
import { createMethodsRuntime, eventSequence, type RegistryEntry } from "./fixtures.js";

const { SessionEventType, STREAM_RECOVERY_DISCARDED_ERROR_NAME, STREAM_RECOVERY_DISCARDED_FINISH } =
  await contractsBundle();
const { TurnMachineImpl } = await coreDeps();
const cancelled = await methods("cancelled-stream-persistence");
const recovery = await methods("streaming-recovery");
const coordinator = await methods("streaming-tool-coordinator");
const synthetic = await methods("streaming-tool-synthetic-result");
const execution = await methods("streaming-tool-execution");

const ASSISTANT_ID = "assistant-msg-0001";
const USER_ID = "user-msg-0001";
const SESSION_ID = "session-contract-0001";
const trace = {
  spanId: "span-contract-0001",
  traceId: "trace-contract-0001",
  turnId: "turn-contract-0001",
} as never;
const model = { modelId: "model-contract", providerId: "provider-contract" };

function makeState() {
  const controller = new AbortController();
  // turn-machine 相位：Idle → ProcessingInput → AwaitingModelResponse（恢复编排从这里起步）。
  const created = TurnMachineImpl.create(
    SESSION_ID,
    1,
    "contract input",
    "trace-contract-0001",
    "turn-contract-0001",
  );
  const started = new TurnMachineImpl(created.start());
  const awaitingModel = new TurnMachineImpl(started.startModelRequest("model-contract", []));
  const state = {
    anomalyWarningsInjected: 0,
    backgroundSubagentResultConsumed: false,
    currentUserMessageId: USER_ID,
    events: [] as { type: string }[],
    historyRoundCount: 0,
    input: "contract input",
    model,
    modelResponse: "partial output",
    modelStepCount: 0,
    reactiveCompactAttemptedInCurrentModelStep: false,
    repeatedToolCallSignature: undefined as string | undefined,
    repeatedToolCallStreakCount: 0,
    stopHookContinuationCount: 0,
    streamRecoveryRetryCount: 0,
    tokenCount: 0,
    toolCallCount: 0,
    turnAbortSignal: controller.signal,
    turnId: "turn-contract-0001",
    turnMachine: awaitingModel,
    turnRequestState: { entries: [] as unknown[], outputTokenContinuationCount: 0 },
    turnTraceContext: trace,
    userMessageId: USER_ID,
    workflowResultConsumed: false,
  };
  return { controller, state };
}

function permissiveEntry(): RegistryEntry {
  return {
    metadata: {
      concurrentSafe: true,
      destructive: false,
      needsApproval: false,
      readOnly: true,
      requiresUserInteraction: false,
      sideEffectScope: "none",
    },
  };
}

const startedEvent = (fake: ReturnType<typeof createMethodsRuntime>) =>
  fake.appended.find((event) => event.type === SessionEventType.StreamRecoveryStarted);

test("B13 取消快照持久化", async () => {
  const fake = createMethodsRuntime();
  const snapshot = {
    reasoning: [
      { text: "", providerOptions: {} },
      { text: "thinking one", providerOptions: { providerHint: "alpha" } },
      { text: "thinking two" },
      { text: "", providerOptions: { tag: "kept" } },
    ],
    text: "partial answer",
  };
  await cancelled.persistCancelledStreamSnapshot(fake.runtime, {
    assistantCreatedAt: 1_700_000_000_000,
    assistantMessageId: ASSISTANT_ID,
    snapshot,
    traceContext: trace,
  });
  assert.deepEqual(
    fake.journal,
    [
      "persist:reasoning:text",
      "persist:reasoning:text",
      "persist:reasoning:content",
      "persist:text:text",
    ],
    "reasoning 块按数组序逐条、text 收尾；空块（无文本无元数据）跳过",
  );
  assert.deepEqual(
    fake.parts.map((part) => (part as { text?: string }).text),
    ["thinking one", "thinking two", "", "partial answer"],
  );
  assert.deepEqual(fake.parts[0], {
    id: (fake.parts[0] as { id: string }).id,
    sessionID: SESSION_ID,
    messageID: ASSISTANT_ID,
    type: "reasoning",
    text: "thinking one",
    metadata: { providerHint: "alpha" },
    time: { start: 1_700_000_000_000, end: (fake.parts[0] as { time: { end: number } }).time.end },
  });
  for (const part of fake.parts) {
    const time = (part as { time: { end: number; start: number } }).time;
    assert.equal(time.start, 1_700_000_000_000);
    assert.equal(
      time.end,
      (fake.parts[0] as { time: { end: number } }).time.end,
      "completedAt 单次取样",
    );
    assert.ok(Number.isInteger(time.end) && time.end >= time.start);
  }
  assert.equal("metadata" in fake.parts[3], false, "text 分部不带 metadata");

  const empty = createMethodsRuntime();
  await cancelled.persistCancelledStreamSnapshot(empty.runtime, {
    assistantCreatedAt: 1_700_000_000_001,
    assistantMessageId: ASSISTANT_ID,
    snapshot: { reasoning: [], text: "" },
    traceContext: trace,
  });
  assert.deepEqual(empty.journal, [], "无内容则不落任何分部");
});

test("B14 恢复预算与尝试记账", () => {
  assert.equal(recovery.hasStreamRecoveryBudget({ streamRecoveryRetryCount: 0 }), true);
  assert.equal(recovery.hasStreamRecoveryBudget({ streamRecoveryRetryCount: 9 }), true);
  assert.equal(recovery.hasStreamRecoveryBudget({ streamRecoveryRetryCount: 10 }), false);

  const state = { streamRecoveryRetryCount: 0 };
  assert.deepEqual(recovery.beginStreamRecoveryAttempt(state), { retryNumber: 1, maxRetries: 10 });
  assert.deepEqual(recovery.beginStreamRecoveryAttempt(state), { retryNumber: 2, maxRetries: 10 });
  assert.equal(state.streamRecoveryRetryCount, 2, "计数单调递增且先加后返回");

  const busyState = { streamRecoveryRetryCount: 3 };
  assert.deepEqual(recovery.beginStartPlanBusyAdmissionRetryAttempt(busyState), {
    retryNumber: 4,
    maxRetries: 2,
  });
  assert.equal(busyState.streamRecoveryRetryCount, 4);
});

test("B15 Start Plan busy 判定/退避/耗尽错误", () => {
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure({ providerCode: "3008" }), true);
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure({ code: "3009" }), true);
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure({ context: { code: "3010" } }), true);
  assert.equal(
    recovery.isStartPlanBusyStreamRecoveryFailure({ cause: { context: { providerCode: "3008" } } }),
    true,
    "沿 cause 链命中",
  );
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure({ code: "3011" }), false);
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure({ code: "3007" }), false);
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure(undefined), false);
  const cyclic: Record<string, unknown> = { code: "3008" };
  cyclic.cause = cyclic;
  assert.equal(recovery.isStartPlanBusyStreamRecoveryFailure(cyclic), true, "环形 cause 不死循环");

  const busyError = Object.assign(new Error("busy"), { code: "3008" });
  const delay = (overrides: Record<string, unknown>) =>
    recovery.getStartPlanBusyAdmissionRetryDelayMs({
      error: busyError,
      providerId: "account:bigmodel-start-plan",
      state: { streamRecoveryRetryCount: 0 },
      turnNumber: 1,
      ...overrides,
    });
  assert.equal(delay({}), 1000);
  assert.equal(delay({ providerId: "account:zai-start-plan" }), 1000);
  assert.equal(delay({ state: { streamRecoveryRetryCount: 1 } }), 2000);
  assert.equal(delay({ state: { streamRecoveryRetryCount: 2 } }), undefined, "退避表越界");
  assert.equal(delay({ turnNumber: 0 }), undefined);
  assert.equal(delay({ providerId: "account:other" }), undefined);
  assert.equal(delay({ error: new Error("plain") }), undefined);

  const exhausted = recovery.createStartPlanBusyAutoRetryExhaustedError(
    Object.assign(new Error("busy"), { context: { code: "3009" } }),
  );
  assert.equal(
    exhausted.message,
    "Start Plan is busy and automatic model stream recovery reached the maximum retry count.",
  );
  assert.equal(recovery.START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE, exhausted.message);
  assert.equal(exhausted.name, "StartPlanBusyAutoRetryExhaustedError");
  assert.equal(exhausted.code, "model_rate_limited");
  assert.deepEqual(exhausted.context, {
    providerCode: "3009",
    reason: "rate_limited",
    retryable: false,
    startPlanBusyAutoRetryExhausted: true,
  });
  assert.ok(exhausted.cause instanceof Error, "入参是 Error 时挂 cause");
  const fallback = recovery.createStartPlanBusyAutoRetryExhaustedError(new Error("not busy"));
  assert.equal(fallback.context.providerCode, "3010", "未命中回默认 3010");
  assert.equal(recovery.createStartPlanBusyAutoRetryExhaustedError("plain text").cause, undefined);
});

test("B16 恢复事件组与锚点", async () => {
  const fake = createMethodsRuntime();
  const { state } = makeState();
  const options = { assistantMessageId: ASSISTANT_ID, traceContext: trace };

  const kinds: [unknown, string][] = [
    [Object.assign(new Error("idle"), { reason: "stream_idle_timeout" }), "provider_timeout"],
    [Object.assign(new Error("net"), { code: "model_network_error" }), "provider_network_error"],
    [new Error("stream broke"), "provider_stream_error"],
    ["plain string failure", "unknown"],
    [new Error("the request timed out"), "provider_timeout"],
  ];
  for (const [error, failureKind] of kinds) {
    await recovery.emitStreamRecoveryStarted(
      fake.runtime,
      state,
      { ...options, failedRequestId: "req-failed-0001" },
      error,
      { retryNumber: 2, maxRetries: 10 },
    );
    const event = startedEvent(fake) as { payload: Record<string, unknown> };
    assert.equal(event.payload.attemptId, `${ASSISTANT_ID}:end-of-stream`);
    assert.equal(event.payload.assistantMessageId, ASSISTANT_ID);
    assert.equal(event.payload.failureKind, failureKind);
    assert.equal(event.payload.message, error instanceof Error ? error.message : String(error));
    assert.equal(event.payload.retryNumber, 2);
    assert.equal(event.payload.maxRetries, 10);
    assert.equal(event.payload.failedRequestId, "req-failed-0001");
    fake.appended.length = 0;
  }

  // 三事件：进入顺序 = 完成顺序 = AnchorSelected → TailDiscarded → RetryStarted。
  const anchorSelectedType = String(SessionEventType.StreamRecoveryAnchorSelected);
  const tailDiscardedType = String(SessionEventType.StreamRecoveryTailDiscarded);
  const retryStartedType = String(SessionEventType.StreamRecoveryRetryStarted);
  const gate = fake.gateNextAppend();
  const eventsBefore = state.events.length;
  const pending = recovery.emitStreamRecoveryRetryEvents(fake.runtime, state, options, {
    retryNumber: 1,
    maxRetries: 10,
    discardedReasoningBytes: 12,
    discardedTextBytes: 34,
    reason: "latest_committed_tool_result",
    toolCallIds: ["call-a", "call-b"],
  });
  assert.deepEqual(fake.journal.slice(-1), [`enter:${anchorSelectedType}`], "先进入第一事件");
  assert.equal(state.events.length, eventsBefore, "appendEvent 完成前不压入事件数组");
  gate.close();
  await pending;
  assert.equal(state.events.length, eventsBefore + 3);
  assert.deepEqual(fake.journal.slice(-6), [
    `enter:${anchorSelectedType}`,
    `exit:${anchorSelectedType}`,
    `enter:${tailDiscardedType}`,
    `exit:${tailDiscardedType}`,
    `enter:${retryStartedType}`,
    `exit:${retryStartedType}`,
  ]);
  assert.deepEqual(
    state.events.slice(eventsBefore).map((event) => event.type),
    [
      SessionEventType.StreamRecoveryAnchorSelected,
      SessionEventType.StreamRecoveryTailDiscarded,
      SessionEventType.StreamRecoveryRetryStarted,
    ],
  );
  const [selected, discarded, retry] = fake.appended as unknown as {
    payload: Record<string, unknown>;
  }[];
  const anchorId = `${ASSISTANT_ID}:call-b:tool-result`;
  assert.deepEqual(selected.payload, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId,
    reason: "latest_committed_tool_result",
    committedToolCallIds: ["call-a", "call-b"],
  });
  assert.deepEqual(discarded.payload, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId,
    assistantMessageId: ASSISTANT_ID,
    discardedReasoningBytes: 12,
    discardedTextBytes: 34,
    discardedToolCallIds: [],
  });
  assert.deepEqual(retry.payload, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId,
    retryNumber: 1,
    maxRetries: 10,
    streamMode: "sse",
  });
  assert.deepEqual(state.pendingStreamRecoveryRequest, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId,
    maxRetries: 10,
    retryNumber: 1,
  });

  // 无已提交工具：previous-message-anchor 兜底 + no_tool_committed + failedRequestId 透传。
  fake.appended.length = 0;
  await recovery.emitStreamRecoveryRetryEvents(
    fake.runtime,
    state,
    { ...options, failedRequestId: "req-failed-0002" },
    {
      retryNumber: 2,
      maxRetries: 10,
      discardedReasoningBytes: 0,
      discardedTextBytes: 0,
      reason: "no_tool_committed",
      toolCallIds: [],
    },
  );
  const fallbackAnchor = `${ASSISTANT_ID}:previous-message-anchor`;
  const [fallbackSelected, , fallbackRetry] = fake.appended as unknown as {
    payload: Record<string, unknown>;
  }[];
  assert.equal(fallbackSelected.payload.anchorId, fallbackAnchor);
  assert.equal(fallbackSelected.payload.reason, "no_tool_committed");
  assert.deepEqual(fallbackSelected.payload.committedToolCallIds, []);
  assert.equal(fallbackRetry.payload.failedRequestId, "req-failed-0002");
  assert.deepEqual(state.pendingStreamRecoveryRequest, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId: fallbackAnchor,
    maxRetries: 10,
    retryNumber: 2,
    recoveredFromRequestId: "req-failed-0002",
  });

  // appendEvent 失败原样冒泡并中断后续事件。
  fake.appended.length = 0;
  fake.failNextAppend(new Error("append broke"));
  await assert.rejects(
    recovery.emitStreamRecoveryRetryEvents(fake.runtime, state, options, {
      retryNumber: 3,
      maxRetries: 10,
      discardedReasoningBytes: 1,
      discardedTextBytes: 1,
      reason: "no_tool_committed",
      toolCallIds: [],
    }),
    /append broke/,
  );
  assert.equal(fake.appended.length, 0, "已发事件不回滚、后续事件不发");
});

test("B17 部分输出失败恢复", async () => {
  const run = async (overrides: Record<string, unknown>) => {
    const fake = createMethodsRuntime();
    const { controller, state } = makeState();
    const listenerCalls: number[] = [];
    const turnAbortListener = () => listenerCalls.push(1);
    controller.signal.addEventListener("abort", turnAbortListener, { once: true });
    const outcome = await recovery.recoverPartialAssistantOutputFailure({
      abortController: new AbortController(),
      assistantCreatedAt: 1_700_000_000_500,
      discardedReasoningBytes: 10,
      discardedTextBytes: 5,
      error: Object.assign(new Error("stream stalled"), {}),
      options: {
        assistantMessageId: ASSISTANT_ID,
        model,
        traceContext: trace,
      },
      runtime: fake.runtime,
      state,
      turnAbortListener,
      ...overrides,
    });
    return { fake, state, controller, listenerCalls, outcome };
  };

  // 短路一：丢弃字节为 0。
  const zero = await run({
    abortController: new AbortController(),
    discardedReasoningBytes: 0,
    discardedTextBytes: 0,
  });
  assert.equal(zero.outcome, false);
  assert.deepEqual(zero.fake.journal, [], "短路不 abort、不发事件、不落盘");

  // 短路二：错误不可重试。
  const notRetryable = await run({ error: new Error("syntax invalid request") });
  assert.equal(notRetryable.outcome, false);
  assert.deepEqual(notRetryable.fake.journal, []);

  // 完整路径。
  const full = await run({});
  assert.equal(full.outcome, true);
  const startedType = String(SessionEventType.StreamRecoveryStarted);
  const anchorSelectedType = String(SessionEventType.StreamRecoveryAnchorSelected);
  const tailDiscardedType = String(SessionEventType.StreamRecoveryTailDiscarded);
  const retryStartedType = String(SessionEventType.StreamRecoveryRetryStarted);
  assert.deepEqual(
    full.fake.journal,
    [
      `enter:${startedType}`,
      `exit:${startedType}`,
      "persistAssistantMessage",
      `enter:${anchorSelectedType}`,
      `exit:${anchorSelectedType}`,
      `enter:${tailDiscardedType}`,
      `exit:${tailDiscardedType}`,
      `enter:${retryStartedType}`,
      `exit:${retryStartedType}`,
    ],
    "abort 后：Started → 丢弃标记 → 恢复重试事件组",
  );
  assert.equal(full.state.streamRecoveryRetryCount, 1);
  assert.equal(full.state.modelStepCount, 1);
  assert.equal(full.state.modelResponse, "");
  assert.equal(full.state.historyRoundCount, 1);
  const persisted = full.fake.assistantMessages[0].args;
  assert.equal(persisted[0], ASSISTANT_ID);
  assert.equal(persisted[1], USER_ID);
  assert.equal(persisted[2], 1_700_000_000_500);
  assert.deepEqual(persisted[3], {
    completed: (persisted[3] as { completed: number }).completed,
    error: {
      name: STREAM_RECOVERY_DISCARDED_ERROR_NAME,
      data: {
        message: "Partial assistant output was discarded before a streaming retry.",
        retryNumber: 1,
      },
    },
    finish: STREAM_RECOVERY_DISCARDED_FINISH,
  });
  assert.equal(persisted[4], trace);
  assert.equal(persisted[5], model);
  assert.equal(STREAM_RECOVERY_DISCARDED_ERROR_NAME, "StreamRecoveryDiscarded");
  assert.equal(STREAM_RECOVERY_DISCARDED_FINISH, "stream_recovery_discarded");
  const retryStarted = full.fake.appended.at(-1) as { payload: Record<string, unknown> };
  assert.equal(retryStarted.payload.reason, undefined);
  assert.deepEqual(
    (full.fake.appended[1] as { payload: Record<string, unknown> }).payload.committedToolCallIds,
    [],
    "no_tool_committed 路径无已提交工具",
  );
  assert.deepEqual(
    full.fake.appended.map((event) => event.type),
    [
      SessionEventType.StreamRecoveryStarted,
      SessionEventType.StreamRecoveryAnchorSelected,
      SessionEventType.StreamRecoveryTailDiscarded,
      SessionEventType.StreamRecoveryRetryStarted,
    ],
  );
  // abort 监听已移除：后续 abort 不再触发监听器。
  full.controller.abort();
  assert.deepEqual(full.listenerCalls, [], "移除 abort 监听防悬挂");
});

test("B18 流式工具准入、接受与 delta 记账", async () => {
  const vetoes: [
    string,
    (entry: RegistryEntry) => RegistryEntry | undefined,
    Record<string, unknown>,
  ][] = [
    ["providerExecuted 不进声明表", (entry) => entry, { providerExecuted: true }],
    ["空工具名", (entry) => entry, { name: "   " }],
    ["注册表无该工具", () => undefined, {}],
    [
      "readOnly 不满足",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, readOnly: false } }),
      {},
    ],
    [
      "concurrentSafe 不满足",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, concurrentSafe: false } }),
      {},
    ],
    [
      "destructive 否决",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, destructive: true } }),
      {},
    ],
    [
      "needsApproval 否决",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, needsApproval: true } }),
      {},
    ],
    [
      "requiresUserInteraction 否决（元数据）",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, requiresUserInteraction: true } }),
      {},
    ],
    [
      "sideEffectScope 非 none 否决",
      (entry) => ({ ...entry, metadata: { ...entry.metadata, sideEffectScope: "workspace" } }),
      {},
    ],
    [
      "permission.sideEffectScope 优先于元数据",
      (entry) => ({ ...entry, permission: { sideEffectScope: "workspace" } }),
      {},
    ],
  ];
  for (const [label, mutate, callFields] of vetoes) {
    const fake = createMethodsRuntime();
    const { state } = makeState();
    const entry = mutate(permissiveEntry());
    if (entry) fake.registryEntries.set("tool-veto", entry);
    const c = coordinator.createStreamingToolCoordinator(fake.runtime, state, {
      assistantMessageId: ASSISTANT_ID,
      model,
      traceContext: trace,
    });
    c.accept({ id: "call-veto", name: "tool-veto", input: {}, ...callFields });
    await c.drain([{ id: "call-veto", name: "tool-veto", input: {} }]);
    assert.ok(!fake.journal.some((line) => line.includes("executeTools")), `${label}：不流中启动`);
  }

  // modelStreaming 关闭 / streamingToolExecution 显式 off。
  for (const config of [{ modelStreaming: "off" }, { streamingToolExecution: "off" }]) {
    const fake = createMethodsRuntime();
    Object.assign(fake.runtime.config, config);
    fake.registryEntries.set("tool-veto", permissiveEntry());
    const { state } = makeState();
    const c = coordinator.createStreamingToolCoordinator(fake.runtime, state, {
      assistantMessageId: ASSISTANT_ID,
      model,
      traceContext: trace,
    });
    c.accept({ id: "call-veto", name: "tool-veto", input: {} });
    await c.drain([{ id: "call-veto", name: "tool-veto", input: {} }]);
    assert.ok(!fake.journal.some((line) => line.includes("executeTools")), JSON.stringify(config));
  }

  // providerExecuted 的调用不进声明表：abandon 只为已登记声明发账本更新。
  const provenance = createMethodsRuntime();
  provenance.registryEntries.set("tool-veto", permissiveEntry());
  const provenanceState = makeState();
  const provenanceCoordinator = coordinator.createStreamingToolCoordinator(
    provenance.runtime,
    provenanceState.state,
    { assistantMessageId: ASSISTANT_ID, model, traceContext: trace },
  );
  provenanceCoordinator.accept({
    id: "call-provider",
    name: "tool-veto",
    input: {},
    providerExecuted: true,
  });
  await provenanceCoordinator.abandon("cancelled");
  assert.ok(
    !provenance.journal.some((line) => line.includes("StreamingToolLedgerUpdated")),
    "providerExecuted 不登记声明",
  );

  // 通过准入：同一 id 不重复启动；declarationIndex 按登记序。
  const pass = createMethodsRuntime();
  pass.registryEntries.set("tool-alpha", permissiveEntry());
  const passState = makeState();
  const passCoordinator = coordinator.createStreamingToolCoordinator(
    pass.runtime,
    passState.state,
    {
      assistantMessageId: ASSISTANT_ID,
      model,
      traceContext: trace,
    },
  );
  passCoordinator.accept({ id: "call-a", name: "tool-alpha", input: {} });
  passCoordinator.accept({ id: "call-a", name: "tool-alpha", input: {} });
  const passResults = await passCoordinator.drain([
    { id: "call-a", name: "tool-alpha", input: {} },
  ]);
  assert.equal(
    pass.journal.filter((line) => line === "enter:executeTools:call-a").length,
    1,
    "同一 toolCall.id 不重复启动",
  );
  assert.equal(pass.parts[0].declarationIndex, 0);
  assert.equal(passResults.length, 1);

  // UTF-8 字节记账：经 TailDiscarded 载荷观察。
  const bytes = createMethodsRuntime();
  const bytesState = makeState();
  const bytesCoordinator = coordinator.createStreamingToolCoordinator(
    bytes.runtime,
    bytesState.state,
    { assistantMessageId: ASSISTANT_ID, model, traceContext: trace },
  );
  bytesCoordinator.recordReasoningDelta("héllo");
  bytesCoordinator.recordTextDelta("你好");
  assert.equal(
    await bytesCoordinator.recoverFromModelFailure(
      Object.assign(new Error("stream stalled"), {}),
      0,
    ),
    true,
    "无声明时走部分输出恢复",
  );
  const tail = bytes.appended.find(
    (event) => event.type === SessionEventType.StreamRecoveryTailDiscarded,
  ) as { payload: Record<string, unknown> };
  assert.equal(tail.payload.discardedReasoningBytes, 6);
  assert.equal(tail.payload.discardedTextBytes, 6);
  const bytesAnchor = bytes.appended.find(
    (event) => event.type === SessionEventType.StreamRecoveryAnchorSelected,
  ) as { payload: Record<string, unknown> };
  assert.equal(bytesAnchor.payload.reason, "no_tool_committed");

  // 流中执行失败：warn 后降级为流末执行，不冒泡。
  const failed = createMethodsRuntime();
  failed.registryEntries.set("tool-alpha", permissiveEntry());
  failed.failNextExecution(new Error("stream tool exploded"));
  const failedState = makeState();
  const failedCoordinator = coordinator.createStreamingToolCoordinator(
    failed.runtime,
    failedState.state,
    { assistantMessageId: ASSISTANT_ID, model, traceContext: trace },
  );
  failedCoordinator.accept({ id: "call-a", name: "tool-alpha", input: {} });
  const failedResults = await failedCoordinator.drain([
    { id: "call-a", name: "tool-alpha", input: {} },
  ]);
  assert.deepEqual(failedResults, [], "降级后流末执行接手");
  const warning = failed.logger.records.find((record) => record.level === "warn");
  assert.equal(warning?.message, "Streaming tool execution fell back to end-of-stream execution");
  assert.equal((warning?.context[0] as { event: string }).event, "tool.streaming.execution_failed");
});

test("B19 取消与收尾交错", async () => {
  // drain 返回序与完成序解耦：后启动的先完成。
  const fake = createMethodsRuntime();
  fake.registryEntries.set("tool-alpha", permissiveEntry());
  fake.registryEntries.set("tool-beta", permissiveEntry());
  const { state } = makeState();
  const c = coordinator.createStreamingToolCoordinator(fake.runtime, state, {
    assistantMessageId: ASSISTANT_ID,
    model,
    traceContext: trace,
  });
  const callA = { id: "call-a", name: "tool-alpha", input: { n: 1 } };
  const callB = { id: "call-b", name: "tool-beta", input: { n: 2 } };
  const gateA = fake.gateExecution("call-a");
  const gateB = fake.gateExecution("call-b");
  c.accept(callA);
  c.accept(callB);
  await Promise.all([gateA.reached, gateB.reached]);
  gateB.close();
  gateA.close();
  const results = await c.drain([callA, callB]);
  assert.deepEqual(
    fake.journal.filter((line) => line.startsWith("exit:executeTools")),
    ["exit:executeTools:call-b", "exit:executeTools:call-a"],
    "完成顺序：后启动的先完成",
  );
  assert.deepEqual(
    results.map((result) => result.toolCallId),
    ["call-a", "call-b"],
    "drain 恒按 toolCalls 参数序返回",
  );
  assert.deepEqual(await c.drain([{ id: "call-unknown", name: "tool-alpha", input: {} }]), []);

  // abandon：全部声明并发发账本更新；未完成执行不阻塞（250ms 上限语义）。
  const abortRun = createMethodsRuntime();
  abortRun.registryEntries.set("tool-alpha", permissiveEntry());
  abortRun.registryEntries.set("tool-beta", permissiveEntry());
  const abortState = makeState();
  const abortCoordinator = coordinator.createStreamingToolCoordinator(
    abortRun.runtime,
    abortState.state,
    { assistantMessageId: ASSISTANT_ID, model, traceContext: trace },
  );
  const hangingGate = abortRun.gateExecution("call-a");
  abortCoordinator.accept({ id: "call-a", name: "tool-alpha", input: {} });
  abortCoordinator.accept({ id: "call-b", name: "tool-beta", input: {} });
  await abortCoordinator.abandon("cancelled");
  const ledger = abortRun.appended.filter(
    (event) =>
      event.type === SessionEventType.StreamingToolLedgerUpdated &&
      (event as unknown as { payload: { status: string } }).payload.status === "tool_cancelled",
  ) as unknown as { payload: Record<string, unknown> }[];
  assert.deepEqual(
    ledger.map((event) => event.payload.toolCallId).sort(),
    ["call-a", "call-b"],
    "对全部声明发账本更新",
  );
  for (const event of ledger) {
    assert.equal(event.payload.status, "tool_cancelled");
    assert.equal(event.payload.blockedReason, "cancelled");
    assert.equal(event.payload.executionTiming, "during_stream");
  }
  hangingGate.close();

  const modelFailed = createMethodsRuntime();
  modelFailed.registryEntries.set("tool-alpha", permissiveEntry());
  const modelFailedState = makeState();
  const modelFailedCoordinator = coordinator.createStreamingToolCoordinator(
    modelFailed.runtime,
    modelFailedState.state,
    { assistantMessageId: ASSISTANT_ID, model, traceContext: trace },
  );
  modelFailedCoordinator.accept({ id: "call-a", name: "tool-alpha", input: {} });
  await modelFailedCoordinator.abandon("model_failed");
  const abandoned = modelFailed.appended.find(
    (event) =>
      event.type === SessionEventType.StreamingToolLedgerUpdated &&
      (event as unknown as { payload: { status: string } }).payload.status === "tool_abandoned",
  ) as unknown as { payload: Record<string, unknown> };
  assert.equal(abandoned.payload.status, "tool_abandoned");
  assert.equal(abandoned.payload.blockedReason, "model_failed");
});

test("B20 流中工具执行管线", async () => {
  const fake = createMethodsRuntime();
  fake.registryEntries.set("tool-alpha", permissiveEntry());
  const { controller, state } = makeState();
  const result = await execution.executeStreamingTool(
    fake.runtime,
    state,
    { id: "call-1", name: "tool-alpha", input: { question: "contract" } },
    {
      assistantMessageId: ASSISTANT_ID,
      declarationIndex: 3,
      model,
      signal: controller.signal,
      traceContext: trace,
    },
  );
  const ledgerType = String(SessionEventType.StreamingToolLedgerUpdated);
  assert.deepEqual(
    fake.journal,
    [
      "persist:tool:pending",
      `enter:${ledgerType}:tool_call_closed`,
      `exit:${ledgerType}:tool_call_closed`,
      "scheduleTools:call-1",
      "toolScheduled:call-1",
      `enter:${ledgerType}:tool_queued`,
      `exit:${ledgerType}:tool_queued`,
      "enter:executeTools:call-1",
      "persist:tool:running",
      `enter:${ledgerType}:tool_started`,
      `exit:${ledgerType}:tool_started`,
      "exit:executeTools:call-1",
    ],
    "pending 分部 → tool_call_closed → 调度 → tool_queued → running 分部 → tool_started",
  );
  assert.equal(fake.parts[0].state?.status, "pending");
  assert.equal(
    fake.parts[0].declarationIndex ??
      (fake.parts[0] as never as { declarationIndex: number }).declarationIndex,
    3,
  );
  assert.equal(fake.parts[1].state?.status, "running");
  assert.equal(result.ledgerRecorded, true);
  assert.equal(result.toolCallId, "call-1");
  assert.equal(result.partID, (fake.parts[0] as { id: string }).id);
  assert.equal(result.result.success, true);

  // 无执行批次结果时返回 undefined，不抛。
  const empty = createMethodsRuntime();
  empty.registryEntries.set("tool-alpha", permissiveEntry());
  const emptyState = makeState();
  const emptyResult = await execution.executeStreamingTool(
    empty.runtime,
    emptyState.state,
    { id: "call-2", name: "tool-alpha", input: {} },
    {
      assistantMessageId: ASSISTANT_ID,
      declarationIndex: 0,
      model,
      signal: emptyState.controller.signal,
      traceContext: trace,
    },
  );
  assert.equal(typeof emptyResult, "object");
});

test("B21 合成工具结果与错误事件", async () => {
  const toolCall = { id: "call-syn", name: "tool-alpha", input: { q: 1 } };
  const notExecuted = synthetic.createSyntheticStreamedToolResult(toolCall, "not_executed");
  const unknownState = synthetic.createSyntheticStreamedToolResult(
    toolCall,
    "unknown_execution_state",
  );
  assert.equal(
    notExecuted.result.modelContent,
    "Tool execution was interrupted during streaming recovery before this tool was executed. Treat this tool call as failed and do not retry blindly.",
  );
  assert.equal(
    unknownState.result.modelContent,
    "Tool execution was interrupted during streaming recovery before a result was committed. Side effects may be unknown; inspect current state before retrying.",
  );
  for (const entry of [notExecuted, unknownState]) {
    assert.equal(entry.result.success, false);
    assert.equal(entry.result.output, null);
    assert.equal(entry.result.durationMs, 0);
    assert.equal(entry.result.error?.type, "stream_recovery_interrupted_tool");
    assert.equal(entry.ledgerRecorded, false);
    assert.equal(entry.toolCallId, "call-syn");
    assert.equal(typeof entry.partID, "string");
    assert.equal(entry.result.startedAt, entry.result.completedAt, "startedAt 与 completedAt 同刻");
    assert.equal(entry.result.error?.message, entry.result.modelContent);
  }

  const fake = createMethodsRuntime();
  await synthetic.emitSyntheticStreamedToolError(fake.runtime, [], trace, notExecuted.result);
  assert.deepEqual(
    fake.appended.map((event) => event.type),
    [SessionEventType.ToolCallError],
  );
  const payload = (fake.appended[0] as unknown as { payload: Record<string, unknown> }).payload;
  assert.equal(payload.toolCallId, "call-syn");
  assert.deepEqual(payload.error, notExecuted.result.error);

  const noError = createMethodsRuntime();
  await synthetic.emitSyntheticStreamedToolError(noError.runtime, [], trace, {
    ...notExecuted.result,
    error: undefined,
  });
  assert.deepEqual(noError.journal, [], "result.error 缺席直接返回");
});

test("B22 模型失败恢复编排", async () => {
  // 短路：turn abort 或预算耗尽。
  const shortCircuits = [
    { aborted: true, retryCount: 0 },
    { aborted: false, retryCount: 10 },
  ];
  for (const scenario of shortCircuits) {
    const fake = createMethodsRuntime();
    const { controller, state } = makeState();
    state.streamRecoveryRetryCount = scenario.retryCount;
    if (scenario.aborted) controller.abort();
    const c = coordinator.createStreamingToolCoordinator(fake.runtime, state, {
      assistantMessageId: ASSISTANT_ID,
      model,
      traceContext: trace,
    });
    assert.equal(await c.recoverFromModelFailure(new Error("model failed"), 0), false);
    assert.deepEqual(fake.journal, [], "短路不发事件");
    assert.equal(state.streamRecoveryRetryCount, scenario.retryCount, "短路不消耗预算");
  }

  // 有声明的完整编排：未执行声明补合成结果，恢复事件与补执行持久化交错。
  const fake = createMethodsRuntime();
  const { state } = makeState();
  const c = coordinator.createStreamingToolCoordinator(fake.runtime, state, {
    assistantMessageId: ASSISTANT_ID,
    model,
    traceContext: trace,
  });
  // 未准入的声明仍登记：不启动执行 → 补执行时合成 not_executed。
  c.accept({ id: "call-a", name: "tool-not-registered", input: { q: 1 } });
  assert.equal(
    await c.recoverFromModelFailure(
      Object.assign(new Error("stream broke"), {}),
      1_700_000_000_900,
      { failedRequestId: "req-failed-0003" },
    ),
    true,
  );
  assert.deepEqual(
    fake.journal.filter((line) => line.startsWith("enter:")),
    [
      `enter:${String(SessionEventType.StreamRecoveryStarted)}`,
      `enter:${String(SessionEventType.StreamingToolLedgerUpdated)}:tool_call_closed`,
      `enter:${String(SessionEventType.ToolCallError)}:stream_recovery_interrupted_tool`,
      `enter:${String(SessionEventType.StreamRecoveryAnchorCreated)}:tool_error`,
      `enter:${String(SessionEventType.StreamingToolLedgerUpdated)}:tool_result_committed`,
      `enter:${String(SessionEventType.StreamRecoveryAnchorSelected)}`,
      `enter:${String(SessionEventType.StreamRecoveryTailDiscarded)}`,
      `enter:${String(SessionEventType.StreamRecoveryRetryStarted)}`,
    ],
    "恢复事件组先于补执行、重试事件组最后",
  );
  assert.equal(state.streamRecoveryRetryCount, 1);
  assert.equal(state.modelStepCount, 1);
  assert.equal(state.toolCallCount, 1);
  assert.equal(state.modelResponse, "");
  assert.equal(state.historyRoundCount, 1);
  const [selected, , retry] = fake.appended.filter((event) =>
    [
      SessionEventType.StreamRecoveryAnchorSelected,
      SessionEventType.StreamRecoveryTailDiscarded,
      SessionEventType.StreamRecoveryRetryStarted,
    ].includes(event.type),
  ) as unknown as { payload: Record<string, unknown> }[];
  assert.deepEqual(selected.payload.committedToolCallIds, ["call-a"], "补执行表与声明表等长同序");
  assert.equal(selected.payload.reason, "latest_committed_tool_result");
  assert.equal(retry.payload.failedRequestId, "req-failed-0003");
  assert.equal(retry.payload.streamMode, "sse");
  assert.deepEqual(state.pendingStreamRecoveryRequest, {
    attemptId: `${ASSISTANT_ID}:end-of-stream`,
    anchorId: `${ASSISTANT_ID}:call-a:tool-result`,
    maxRetries: 10,
    retryNumber: 1,
    recoveredFromRequestId: "req-failed-0003",
  });
  // 补执行的 result 形状经 step-finish 持久化面观察。
  const stepFinish = fake.parts.find((part) => part.type === "step-finish") as {
    reason: string;
    tokens: unknown;
  };
  assert.equal(stepFinish.reason, "tool-calls");
  const finishMessage = fake.assistantMessages.at(-1)?.args[3] as { finish: string };
  assert.equal(finishMessage.finish, "tool-calls");
  // 补执行把 assistant 条目与合成工具结果写入 provider 可见历史。
  assert.ok(
    fake.journal.includes("historyEntries:1"),
    "空 assistant 文本 + 声明工具表提交进 turn 请求历史",
  );
});
