// SPDX-License-Identifier: Apache-2.0
// 测试底盘：journal 记录 + gate 握手的 fake runtime。事件序列断言（S1–S5）以 journal 顺序为真值，
// 推进全靠 gate 握手（不 sleep、不设固定超时）。时间取样走可注入 clock，金样录制时符号化。
import assert from "node:assert/strict";
import {
  createMessageId,
  TurnMachineImpl,
} from "../../../../apps/cli/packages/core/src/runtime/deps.js";
import type {
  MessageId,
  SessionEvent,
  TraceContext,
  TurnId,
} from "../../../../apps/cli/packages/core/src/runtime/deps.js";

/** 日志记号。 */
export type JournalMark = { kind: string; [key: string]: unknown };

/** 可注入时钟（金样符号化用）。 */
export interface FakeClock {
  now(): number;
  advance(ms: number): void;
}

export const createFakeClock = (start = 1000): FakeClock => {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

/** gate：一拍一放行；断言方在下游 await 放行前检查 journal。 */
export interface Gate {
  wait(): Promise<void>;
  open(): void;
  readonly tick: number;
}

export const createGate = (): Gate => {
  const state = { tick: 0 };
  const pending: Array<() => void> = [];
  return {
    get tick() {
      return state.tick;
    },
    wait: () =>
      new Promise<void>((resolve) => {
        pending.push(resolve);
      }),
    open: () => {
      state.tick += 1;
      pending.shift()?.();
    },
  };
};

/** journal：有序记录全部观察。 */
export class Journal {
  readonly marks: JournalMark[] = [];
  add(mark: JournalMark): void {
    this.marks.push(mark);
  }
  ofKind(kind: string): JournalMark[] {
    return this.marks.filter((mark) => mark.kind === kind);
  }
  kinds(): string[] {
    return this.marks.map((mark) => mark.kind);
  }
  /** 断言某次序是 journal kinds 的子序列（gate 握手样式）。 */
  assertSubsequence(expected: readonly string[]): void {
    const actual = this.kinds();
    let cursor = 0;
    for (const want of expected) {
      const found = actual.indexOf(want, cursor);
      assert.ok(found >= 0, `journal 缺少次序记号 ${want}（已过 ${cursor}）`);
      cursor = found + 1;
    }
  }
}

/** 剧本化模型结果（虚构数据）。 */
export const scriptedResult = (overrides: Record<string, unknown> = {}) => ({
  finishReason: "stop",
  text: "【虚构】模型回复正文",
  toolCalls: undefined,
  reasoning: undefined,
  usage: {
    inputTokens: 12,
    outputTokens: 34,
    totalTokens: 46,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  },
  providerMetadata: { vendor: "fictional", recoveredFromStreamFailure: true },
  ...overrides,
});

/** fake runtime（slice 全端口面，journal 全记）。 */
export const createFakeRuntime = (options: {
  clock: FakeClock;
  journal: Journal;
  config?: Record<string, unknown>;
  result?: Record<string, unknown>;
  onModelRequest?: (request: Record<string, unknown>) => void;
}) => {
  const { clock, journal } = options;
  const runtime = {
    sessionId: "session_test",
    turnNumber: 3,
    config: {
      taskType: "interactive",
      agentName: "agent",
      mode: "build",
      modelContextBudgetStrategy: "reserve_output",
      modelAnomalyGuard: { maxToolCalls: 50, repeatedToolCallStreak: 3 },
      compact: { enabled: true },
      ...options.config,
    },
    journal,
    clock,
    logger: {
      debug: (message: string, fields: Record<string, unknown>) =>
        journal.add({ kind: "log.debug", message, ...fields }),
      info: (message: string, fields: Record<string, unknown>) =>
        journal.add({ kind: "log.info", message, ...fields }),
      warn: (message: string, fields: Record<string, unknown>) =>
        journal.add({ kind: "log.warn", message, ...fields }),
    },
    agentTelemetry: {
      step: () => ({
        run: (fn: () => Promise<unknown>) => fn(),
        finishCompleted: (reason: string) =>
          journal.add({ kind: "telemetry", outcome: "completed", reason }),
        finishCancelled: (reason: string) =>
          journal.add({ kind: "telemetry", outcome: "cancelled", reason }),
        finishFailed: (code: string, sub: string) =>
          journal.add({ kind: "telemetry", outcome: "failed", code, sub }),
      }),
    },
    logModelRequestSteeringContext: (fields: Record<string, unknown>) =>
      journal.add({ kind: "log.steering", ...fields }),
    createEvent: (type: unknown, payload: unknown) => {
      journal.add({ kind: "create.event", type, payload });
      return {
        id: `event_${journal.marks.length}`,
        type,
        payload,
        timestamp: new Date(clock.now()),
        sessionId: "session_test",
      };
    },
    appendEvent: async (event: SessionEvent) =>
      journal.add({ kind: "append.event", type: event.type }),
    persistAssistantMessage: async (
      messageId: MessageId,
      _parent: unknown,
      createdAt: number,
      finish: unknown,
    ) => journal.add({ kind: "persist.assistant", messageId, createdAt, finish }),
    persistPart: async (part: unknown) => journal.add({ kind: "persist.part", part }),
    runModelTextRequest: async (request: Record<string, unknown>) => {
      journal.add({ kind: "model.request", keys: Object.keys(request) });
      options.onModelRequest?.(request);
      return options.result ?? scriptedResult();
    },
    extractToolCallsFromResult: (result: { toolCalls?: unknown[] }) => result.toolCalls ?? [],
    mainTurnCacheHitAggregate: {
      requestCount: 0,
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
    },
    currentTurnFileChanges: new Map(),
    messageHistory: {
      addEntries: () => {},
      getMessageCount: () => 0,
      getCacheStats: () => ({}),
      setCacheHit: () => journal.add({ kind: "history.cacheHit" }),
    },
    sessionStore: undefined,
    registry: { get: () => undefined, getMetadata: () => undefined },
    modelFactory: (input: { selection?: { providerId: string; modelId: string } }) => ({
      providerId: input.selection?.providerId ?? "fictional",
      modelId: input.selection?.modelId ?? "model_test",
      displayName: "【虚构】模型",
      properties: { contextWindow: 32000, inputFormat: { text: true } },
      optionSpecs: { maxOutputTokens: { max: 8192 }, reasoningLevel: { values: ["low"] } },
      options: { reasoningLevel: "low" },
    }),
    scheduleTools: async () => ({ accepted: [] }),
    toScheduleState: (schedule: unknown) => schedule,
    executeTools: async (calls: Array<{ id: string; name: string; input: unknown }>) => ({
      results: calls.map((call) => ({
        toolCallId: call.id,
        toolName: call.name,
        success: true,
        output: "【虚构】工具输出",
        startedAt: new Date(clock.now()),
        completedAt: new Date(clock.now()),
        durationMs: 5,
      })),
      events: [],
    }),
    emitToolScheduledEvents: async (calls: Array<{ id: string; name: string; input: unknown }>) => {
      const events = calls.map((call) => ({
        id: `event_sched_${call.id}`,
        type: "tool_call_scheduled",
        payload: { toolCallId: call.id, toolName: call.name },
        timestamp: new Date(clock.now()),
        sessionId: "session_test",
      }));
      journal.add({ kind: "emit.toolScheduled", count: calls.length });
      return events;
    },
    runStopHooks: async () => ({ continueRequested: false, additionalContexts: [] }),
    shouldContinueAfterStopHooks: () => false,
    hasInlineGuidePendingInput: () => false,
    fallbackPendingGuidesToQueue: async () => {},
    beginActiveTurn: () => ({ turnId: "turn_test" }),
    finishActiveTurn: () => {},
    ensureSessionPersisted: async () => {},
    compactActiveConversation: async () => ({
      outcome: "compacted",
      displayText: "【虚构】compact 摘要",
      tokenCount: 10,
      entries: [],
    }),
    rebuildProjection: async () => ({ messages: [] }),
    buildContextUsageSnapshot: () => ({}),
    buildContextUsageBreakdownFromSnapshot: () => [],
    logContextUsageSnapshot: () => {},
    reactiveCompactAfterContextExceeded: async () => "skipped",
    emitFileMutationCheckpoint: async () => {},
  };
  return runtime;
};

/** 建 trace（合成、无真实数据）。 */
export const fakeTrace = (turnId = "turn_test"): TraceContext =>
  ({
    traceId: "trace_test",
    turnId: turnId as TurnId,
    spanId: "span_test",
    queryId: "query_test",
  }) as unknown as TraceContext;

/** 建 RegularTurnLoopState 形状（真 TurnMachineImpl，相位到 streaming）。 */
export const createState = (overrides: Record<string, unknown> = {}) => {
  const started = TurnMachineImpl.create(
    "session_test",
    3,
    { input: "【虚构】用户输入" },
    "trace_test",
    "turn_test",
  ).start();
  const machine = new TurnMachineImpl(started).startModelRequest("model_test", []);
  return {
    model: {
      providerId: "fictional",
      modelId: "model_test",
      optionSpecs: { maxOutputTokens: { max: 8192 }, reasoningLevel: { values: ["low"] } },
      properties: { contextWindow: 32000, inputFormat: { text: true } },
      options: { reasoningLevel: "low" },
    },
    turnAbortSignal: new AbortController().signal,
    modelStepCount: 0,
    modelResponse: "",
    toolCallCount: 0,
    tokenCount: 0,
    historyRoundCount: 0,
    events: [] as unknown[],
    turnRequestState: { entries: [] as unknown[], outputTokenContinuationCount: 0 },
    turnMachine: new TurnMachineImpl(machine),
    currentUserMessageId: createMessageId(),
    userMessageId: createMessageId(),
    turnId: "turn_test",
    traceId: "trace_test",
    turnTraceContext: fakeTrace(),
    compactTracking: { consecutiveRapidRefills: 0, toolTurnsSinceCompact: 0 },
    streamRecoveryRetryCount: 0,
    stopHookContinuationCount: 0,
    turnFileChanges: new Map(),
    ...overrides,
  };
};

/** 断言 journal 中的账本状态序（gate 握手样式，无 sleep）。 */
export function assertLedgerStatusOrder(journal: Journal, toolCallId: string): void {
  const statuses = journal
    .ofKind("ledger")
    .filter((mark) => mark.toolCallId === toolCallId)
    .map((mark) => mark.status);
  assert.deepEqual(statuses, [
    "tool_call_closed",
    "tool_queued",
    "tool_started",
    "tool_result_committed",
  ]);
}
