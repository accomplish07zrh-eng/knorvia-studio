// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：事件管线、sink 通知、会话持久化与追加汇总（B23–B25/B27）。
// B23/B25 的日志序列与 B24 的串行通知都用 gate 握手断言，无 sleep、无固定超时。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contractDir, contractsBundle, coreDeps, methods } from "./entry.mjs";
import { createMethodsRuntime, type FakeMethodsRuntime } from "./fixtures.js";

const { SessionEventType } = await contractsBundle();
const { CoreErrorType } = await coreDeps();
const eventsModule = await methods("events");
const eventsSummary = await methods("events-summary");
const eventsSession = await methods("events-session");

const SESSION_ID = "session-contract-0001";
const trace = {
  spanId: "span-contract-0001",
  traceId: "trace-contract-0001",
  turnId: "turn-contract-0001",
} as never;

/** 接线：把 runtime 方法指向模块函数（与真实装配一致）。 */
function wireEvents(fake: FakeMethodsRuntime) {
  const target = fake.runtime as unknown as Record<string, unknown>;
  target.notifyEventSinks = (event: unknown, traceContext: unknown) =>
    eventsModule.notifyEventSinks.call(fake.runtime, event, traceContext);
  target.createEvent = (type: unknown, payload: unknown, traceContext: unknown) =>
    eventsModule.createEvent.call(fake.runtime, type, payload, traceContext);
  target.appendEvent = (event: unknown, traceContext: unknown) =>
    eventsModule.appendEvent.call(fake.runtime, event, traceContext);
  let sequence = 0;
  const appended: { event: unknown; sequenceNumber: number }[] = [];
  target.eventStore = {
    async append(event: unknown) {
      appended.push({ event, sequenceNumber: sequence + 1 });
      fake.journal.push("eventStore.append");
      return { ...(event as Record<string, unknown>), sequenceNumber: ++sequence };
    },
  };
  target.eventSinks = [] as { onSessionEvent(event: unknown): Promise<void> }[];
  target.sessionPersisted = false;
  return { appended, target };
}

const logLines = (fake: FakeMethodsRuntime) =>
  fake.logger.records.map((record) => `${record.level}:${record.message}`);

test("B23 事件创建与追加管线", async () => {
  // createEvent：类型/会话/负载 + turnId/traceId 身份。
  const creator = createMethodsRuntime();
  wireEvents(creator);
  const payload = { note: "contract" };
  const created = eventsModule.createEvent.call(
    creator.runtime,
    SessionEventType.TurnStarted,
    payload,
    trace,
  ) as Record<string, unknown>;
  assert.equal(created.type, SessionEventType.TurnStarted);
  assert.equal(created.sessionId, SESSION_ID);
  assert.equal(created.payload, payload);
  assert.equal(created.turnId, "turn-contract-0001");
  assert.equal(created.traceId, "trace-contract-0001");
  assert.equal(created.sequenceNumber, 0);
  assert.equal(eventsModule.isSessionPersisted.call(creator.runtime), false);
  (creator.runtime as unknown as Record<string, unknown>).sessionPersisted = true;
  assert.equal(eventsModule.isSessionPersisted.call(creator.runtime), true);

  // 生命周期事件管线：started info → append → durable → usage → sinks → completed info → appended debug。
  const fake = createMethodsRuntime();
  const wired = wireEvents(fake);
  const sinkCalls: string[] = [];
  (fake.runtime as unknown as { eventSinks: unknown[] }).eventSinks = [
    {
      async onSessionEvent(event: { type: string }) {
        sinkCalls.push(event.type);
      },
    },
  ];
  const lifecycle = eventsModule.createEvent.call(
    fake.runtime,
    SessionEventType.TurnStarted,
    { turn: 1 },
    trace,
  ) as { type: string };
  await eventsModule.appendEvent.call(fake.runtime, lifecycle, trace);
  assert.deepEqual(logLines(fake), [
    "info:Session event persistence started",
    "info:Session event persistence completed",
    "debug:Session event appended",
  ]);
  assert.deepEqual(
    fake.journal,
    ["eventStore.append"],
    "管线：append → durable（无 sessionStore 跳过）→ usage（无 store 跳过）→ sinks",
  );
  assert.deepEqual(sinkCalls, ["turn_started"], "sink 在持久化后收到事件");
  assert.equal(wired.appended.length, 1);
  const completedLog = fake.logger.records[1].context[0] as Record<string, unknown>;
  assert.equal(completedLog.event, "session.event.persistence.completed");
  assert.equal(completedLog.sessionEventSequenceNumber, 1);
  assert.equal(completedLog.sessionEventType, "turn_started");
  assert.equal(completedLog.status, "completed");
  assert.equal(typeof completedLog.durationMs, "number");

  // 汇总命中：跳过 appended debug（不冲刷汇总）。
  const summarized = createMethodsRuntime();
  const summarizedWired = wireEvents(summarized);
  const streaming = eventsModule.createEvent.call(
    summarized.runtime,
    SessionEventType.ModelStreaming,
    { kind: "text_delta", delta: "x" },
    trace,
  );
  await eventsModule.appendEvent.call(summarized.runtime, streaming, trace);
  assert.deepEqual(
    logLines(summarized),
    [],
    "ModelStreaming 非生命周期（无管线日志）；汇总命中跳过 appended debug",
  );
  assert.equal(summarizedWired.appended.length, 1);
  assert.equal(
    summarized.logger.records.some((record) => record.message === "Session event append summary"),
    false,
    "汇总命中不冲刷、不打 appended debug",
  );

  // 失败：生命周期事件打 warn（带 phase）后原样重抛；非生命周期不打失败日志。
  const broken = createMethodsRuntime();
  wireEvents(broken);
  (broken.runtime as unknown as { eventStore: { append(): Promise<unknown> } }).eventStore.append =
    async () => {
      throw new Error("event store broke");
    };
  const failingLifecycle = eventsModule.createEvent.call(
    broken.runtime,
    SessionEventType.TurnError,
    { error: "x" },
    trace,
  );
  await assert.rejects(
    eventsModule.appendEvent.call(broken.runtime, failingLifecycle, trace),
    /event store broke/,
  );
  assert.deepEqual(logLines(broken), [
    "info:Session event persistence started",
    "warn:Session event persistence failed",
  ]);
  const failureLog = broken.logger.records[1].context[0] as Record<string, unknown>;
  assert.equal(failureLog.event, "session.event.persistence.failed");
  assert.equal(failureLog.phase, "event_store.append");
  assert.equal(failureLog.status, "failed");
  assert.equal(failureLog.errorMessage, "event store broke");

  const quiet = createMethodsRuntime();
  wireEvents(quiet);
  (quiet.runtime as unknown as { eventStore: { append(): Promise<unknown> } }).eventStore.append =
    async () => {
      throw new Error("quiet broke");
    };
  const nonLifecycle = eventsModule.createEvent.call(
    quiet.runtime,
    SessionEventType.ToolCallProgress,
    {},
    trace,
  );
  await assert.rejects(
    eventsModule.appendEvent.call(quiet.runtime, nonLifecycle, trace),
    /quiet broke/,
  );
  assert.deepEqual(quiet.logger.records, [], "非生命周期事件不打失败日志");
});

test("B24 sink 通知", async () => {
  // 严格串行：前一 sink 完成才通知下一个。
  const fake = createMethodsRuntime();
  wireEvents(fake);
  const order: string[] = [];
  let release = () => undefined;
  const barrier = new Promise<void>((done) => {
    release = () => done();
  });
  (fake.runtime as unknown as { eventSinks: unknown[] }).eventSinks = [
    {
      async onSessionEvent() {
        order.push("first-enter");
        await barrier;
        order.push("first-exit");
      },
    },
    {
      async onSessionEvent() {
        order.push("second-enter");
      },
    },
  ];
  const event = eventsModule.createEvent.call(
    fake.runtime,
    SessionEventType.ModelRequest,
    {},
    trace,
  );
  const pending = eventsModule.notifyEventSinks.call(fake.runtime, event, trace);
  assert.deepEqual(order, ["first-enter"], "串行：第二 sink 未被通知");
  release();
  await pending;
  assert.deepEqual(order, ["first-enter", "first-exit", "second-enter"]);

  // 单 sink 失败 warn 后继续；本函数不抛。
  const resilient = createMethodsRuntime();
  wireEvents(resilient);
  const reached: string[] = [];
  (resilient.runtime as unknown as { eventSinks: unknown[] }).eventSinks = [
    {
      async onSessionEvent() {
        throw new Error("sink broke");
      },
    },
    {
      async onSessionEvent(event: { type: string }) {
        reached.push(event.type);
      },
    },
  ];
  const event2 = eventsModule.createEvent.call(
    resilient.runtime,
    SessionEventType.TurnComplete,
    {},
    trace,
  );
  await eventsModule.notifyEventSinks.call(resilient.runtime, event2, trace);
  assert.deepEqual(reached, ["turn_complete"], "后续 sink 继续通知");
  const [warning] = resilient.logger.records;
  assert.equal(warning.level, "warn");
  assert.equal(warning.message, "Session event sink failed");
  assert.equal((warning.context[0] as { event: string }).event, "session_event_sink.failed");
  assert.equal((warning.context[0] as { errorMessage: string }).errorMessage, "sink broke");
});

test("B25 会话持久化", async () => {
  const calls: { args: unknown[]; method: string }[] = [];
  const sessionStore = new Proxy(
    {},
    {
      get(_target, method: string) {
        return (...args: unknown[]) => {
          calls.push({ args, method });
          return undefined;
        };
      },
    },
  );
  const fake = createMethodsRuntime();
  const wired = wireEvents(fake);
  const target = fake.runtime as unknown as Record<string, unknown>;
  target.sessionStore = sessionStore;
  target.workingDirectory = "D:/contract-workspace";
  target.appVersion = "1.2.3-contract";
  target.getSessionModelSelection = () => undefined;
  target.config = {
    memory: { workspaceIdentity: "  " },
    mode: undefined,
    parentSessionId: "parent-session-0001",
    taskType: undefined,
    workspaceIdentity: undefined,
    workspacePath: "D:/contract-persisted",
  };
  target.messageHistory = {
    addAttachment() {
      return undefined;
    },
    borrowReadOnlyRuntimeEntries() {
      return [];
    },
  };

  await eventsSession.ensureSessionPersisted.call(fake.runtime, "  Contract first input  ", trace);
  // 标题事件走 B23 管线：其日志嵌套在「Session persisted」之后、「persistence completed」之前。
  assert.deepEqual(logLines(fake), [
    "info:Session persistence started",
    "debug:Session persisted",
    "info:Session event persistence started",
    "info:Session event persistence completed",
    "debug:Session event appended",
    "info:Session persistence completed",
  ]);
  const create = calls.find((entry) => entry.method === "createSession");
  assert.ok(create, "① createSession 先落库");
  const record = create?.args[0] as Record<string, unknown>;
  assert.equal(record.id, SESSION_ID);
  assert.equal(record.workspaceID, "", "workspaceIdentity trim 后为空即空串透传");
  assert.equal(record.parentID, "parent-session-0001");
  assert.equal(record.traceID, "trace-contract-0001");
  assert.equal(record.directory, "D:/contract-persisted", "workspacePath 优先于 workingDirectory");
  assert.equal(record.path, "D:/contract-persisted");
  assert.equal(record.titleSource, "first_input");
  assert.equal(record.version, "1.2.3-contract");
  assert.deepEqual(record.permission, { mode: "build" });
  assert.equal(typeof record.title, "string");
  assert.ok(record.title.length > 0);

  // sessionPersisted 置位点：在标题事件之前（标题事件载荷 source: first_input）。
  assert.equal(fake.runtime.sessionPersisted, true, "⑤ sessionPersisted 置位");
  const titleEvent = wired.appended.at(-1)?.event as {
    payload: Record<string, unknown>;
    type: string;
  };
  assert.equal(titleEvent.type, String(SessionEventType.SessionTitleUpdated));
  assert.deepEqual(titleEvent.payload, {
    previousTitle: "",
    source: "first_input",
    title: record.title,
  });
  const persistedIndex = fake.logger.records.findIndex(
    (entry) => entry.message === "Session persisted",
  );
  assert.ok(persistedIndex > 0, "④ debug Session persisted 在置位后");

  // 幂等短路：sessionPersisted 已真直接返回。
  const before = calls.length;
  await eventsSession.ensureSessionPersisted.call(fake.runtime, "second input", trace);
  assert.equal(calls.length, before, "重复调用不重复建会话");

  // 失败：warn 带 phase 后原样重抛；sessionPersisted 保持 false。
  const failing = createMethodsRuntime();
  wireEvents(failing);
  const failTarget = failing.runtime as unknown as Record<string, unknown>;
  failTarget.sessionStore = {
    async createSession() {
      throw new Error("session store broke");
    },
  };
  failTarget.workingDirectory = "D:/contract-workspace";
  failTarget.appVersion = "1.2.3-contract";
  failTarget.getSessionModelSelection = () => undefined;
  failTarget.config = {};
  await assert.rejects(
    eventsSession.ensureSessionPersisted.call(failing.runtime, "input", trace),
    /session store broke/,
  );
  assert.deepEqual(logLines(failing), [
    "info:Session persistence started",
    "warn:Session persistence failed",
  ]);
  const failure = failing.logger.records[1].context[0] as Record<string, unknown>;
  assert.equal(failure.event, "session.persistence.failed");
  assert.equal(failure.phase, "session_store.create");
  assert.equal(failure.errorMessage, "session store broke");
  assert.equal(failing.runtime.sessionPersisted, false, "失败时置位点未到达");
});

test("B27 追加汇总节流", () => {
  const fake = createMethodsRuntime();
  const summarized = [
    SessionEventType.ModelStreaming,
    SessionEventType.ModelNetworkStatus,
    SessionEventType.StreamingToolLedgerUpdated,
    SessionEventType.ToolCallProgress,
  ];
  for (const type of summarized) {
    assert.equal(
      eventsSummary.admitAppendSummary(
        fake.runtime,
        { id: `evt-${type}`, payload: {}, sequenceNumber: 1, type } as never,
        trace,
      ),
      true,
      `${type} 进汇总`,
    );
  }
  for (const type of [SessionEventType.TurnStarted, SessionEventType.ModelRequest]) {
    assert.equal(
      eventsSummary.admitAppendSummary(
        fake.runtime,
        { id: "evt-x", payload: {}, sequenceNumber: 1, type } as never,
        trace,
      ),
      false,
      `${type} 不进汇总`,
    );
  }

  // 条目累计：eventCount、first*/last*、payloadBytes、payloadKinds（含 <missing>）。
  const accumulator = createMethodsRuntime();
  const makeEvent = (id: string, sequenceNumber: number, payload: Record<string, unknown>) =>
    ({ id, payload, sequenceNumber, type: SessionEventType.ModelStreaming }) as never;
  eventsSummary.admitAppendSummary(
    accumulator.runtime,
    makeEvent("evt-1", 3, { kind: "text_delta" }),
    trace,
  );
  eventsSummary.admitAppendSummary(
    accumulator.runtime,
    makeEvent("evt-2", 5, { note: "no kind" }),
    trace,
  );
  eventsSummary.flushAppendSummaries(accumulator.runtime, trace, "low_frequency_event");
  const [summary] = accumulator.logger.records;
  assert.equal(summary.level, "debug");
  assert.equal(summary.message, "Session event append summary");
  const context = summary.context[0] as Record<string, unknown>;
  assert.equal(context.event, "event_store.appended.summary");
  assert.equal(context.eventCount, 2);
  assert.equal(context.firstEventId, "evt-1");
  assert.equal(context.firstSessionEventSequenceNumber, 3);
  assert.equal(context.lastEventId, "evt-2");
  assert.equal(context.lastSessionEventSequenceNumber, 5);
  assert.equal(context.flushReason, "low_frequency_event");
  assert.equal(context.sessionEventType, SessionEventType.ModelStreaming);
  assert.deepEqual(context.payloadKinds, { "<missing>": 1, text_delta: 1 });
  assert.equal(
    context.payloadBytes,
    Buffer.byteLength(JSON.stringify({ kind: "text_delta" }), "utf8") +
      Buffer.byteLength(JSON.stringify({ note: "no kind" }), "utf8"),
    "payloadBytes 按 JSON UTF-8 字节累计",
  );

  // 冲刷即清空：重复冲刷空表 no-op。
  eventsSummary.flushAppendSummaries(accumulator.runtime, trace, "low_frequency_event");
  assert.equal(accumulator.logger.records.length, 1, "重复冲刷空表 no-op");

  // 键 = <turnId|session>:<type>：不同 turnId 各自累计、分键冲刷。
  const keyed = createMethodsRuntime();
  const otherTrace = { ...trace, turnId: "turn-contract-0002" } as never;
  eventsSummary.admitAppendSummary(keyed.runtime, makeEvent("evt-a", 1, {}), trace);
  eventsSummary.admitAppendSummary(keyed.runtime, makeEvent("evt-b", 2, {}), otherTrace);
  eventsSummary.flushAppendSummaries(keyed.runtime, trace, "low_frequency_event");
  assert.equal(keyed.logger.records.length, 2, "两个 turnId 两个键各冲刷一条");

  // 计数阈值 100：累计到 eventCount >= 100 立即以 count_threshold 冲刷。
  const threshold = createMethodsRuntime();
  for (let index = 1; index <= 99; index += 1) {
    eventsSummary.admitAppendSummary(
      threshold.runtime,
      makeEvent(`evt-${index}`, index, {}),
      trace,
    );
  }
  assert.equal(threshold.logger.records.length, 0, "99 条不冲刷");
  eventsSummary.admitAppendSummary(threshold.runtime, makeEvent("evt-100", 100, {}), trace);
  const [thresholdFlush] = threshold.logger.records;
  assert.equal(thresholdFlush.message, "Session event append summary");
  const thresholdContext = thresholdFlush.context[0] as Record<string, unknown>;
  assert.equal(thresholdContext.flushReason, "count_threshold");
  assert.equal(thresholdContext.eventCount, 100);
});

/** Proxy sessionStore：任意方法都记录后返回 undefined（usage/持久化分派断言用）。 */
function recordingStore() {
  const calls: { args: unknown[]; method: string }[] = [];
  const store = new Proxy(
    {},
    {
      get(_target, method: string) {
        return (...args: unknown[]) => {
          calls.push({ args, method });
          return undefined;
        };
      },
    },
  );
  return { calls, store };
}

test("B26 持久化事件分派", async () => {
  const durable = await methods("events-durable");

  // 无 sessionStore 直接返回。
  const bare = createMethodsRuntime();
  await durable.persistDurableEvent(
    bare.runtime,
    { type: SessionEventType.CheckpointCreated, payload: {}, id: "evt-1", sequenceNumber: 1 },
    trace,
  );
  assert.deepEqual(bare.logger.records, []);

  const run = async (event: Record<string, unknown>) => {
    const fake = createMethodsRuntime();
    const { calls, store } = recordingStore();
    (fake.runtime as unknown as Record<string, unknown>).sessionStore = store;
    await durable.persistDurableEvent(fake.runtime, event, trace);
    return { calls, fake };
  };

  // checkpoint / rewind：走工作区账本。
  const checkpoint = await run({
    type: SessionEventType.CheckpointCreated,
    payload: {
      checkpointId: "checkpoint-0001",
      messageId: "msg-0001",
      scope: "workspace",
      snapshotRef: "snapshot-ref-0001",
    },
    id: "evt-cp",
    sequenceNumber: 2,
    timestamp: new Date(1_700_000_000_000),
  });
  assert.ok(
    checkpoint.calls.length > 0,
    `CheckpointCreated 落工作区账本 ${JSON.stringify(checkpoint.fake.logger.records)}`,
  );
  const checkpointEntry = checkpoint.calls.at(-1)?.args[0] as Record<string, unknown>;
  assert.equal(checkpointEntry.id, "workspace-checkpoint:evt-cp");
  // RewindTriggered：分派错误冒泡（无效载荷被 zod 校验拒绝，错误原样上抛）。
  const rewindFake = createMethodsRuntime();
  const rewindRecording = recordingStore();
  (rewindFake.runtime as unknown as Record<string, unknown>).sessionStore = rewindRecording.store;
  await assert.rejects(
    durable.persistDurableEvent(
      rewindFake.runtime,
      {
        type: SessionEventType.RewindTriggered,
        payload: { rewindId: "rw-1" },
        id: "evt-rw",
        sequenceNumber: 3,
        timestamp: new Date(1_700_000_000_000),
      },
      trace,
    ),
    /Required/,
    "rewind 分派错误冒泡",
  );

  // TurnSteerDiscarded：promoted 不落盘；其余按 id settle。
  const promoted = await run({
    type: SessionEventType.TurnSteerDiscarded,
    payload: { reason: "promoted", pendingInputIds: ["in-1"] },
    id: "evt-p",
    sequenceNumber: 4,
    timestamp: new Date(1_700_000_000_000),
  });
  assert.deepEqual(promoted.calls, [], "promoted 不落盘");
  const discarded = await run({
    type: SessionEventType.TurnSteerDiscarded,
    payload: { reason: "session_resumed", pendingInputIds: ["in-1", "in-2"] },
    id: "evt-d",
    sequenceNumber: 5,
    timestamp: new Date(1_700_000_000_000),
  });
  assert.equal(discarded.calls.length, 2, "逐 id settle 串行");

  // 其余类型 no-op。
  const unrelated = await run({
    type: SessionEventType.TurnStarted,
    payload: {},
    id: "evt-u",
    sequenceNumber: 6,
    timestamp: new Date(1_700_000_000_000),
  });
  assert.deepEqual(unrelated.calls, [], "不在分派表的类型 no-op");
});

test("B28 模型用量事实", async () => {
  const usage = await methods("usage-observability");
  const events = [
    {
      type: SessionEventType.ModelNetworkStatus,
      payload: { type: "model_retry_scheduled", reason: "rate_limited" },
    },
    {
      type: SessionEventType.ModelNetworkStatus,
      payload: { type: "model_request_failed", reason: "network_error", retryable: false },
    },
  ];
  const startedAt = Date.now() - 42;

  // 四方法门槛：缺一静默返回。
  const gated = createMethodsRuntime();
  (gated.runtime as unknown as Record<string, unknown>).sessionStore = {
    recordModelUsage() {
      throw new Error("must not be called");
    },
  };
  await usage.recordModelUsageFact(gated.runtime, {
    assistantMessageId: "assistant-msg-0001",
    events,
    model: { modelId: "model-contract", providerId: "provider-contract" },
    networkEventStartIndex: 0,
    querySource: "main_turn",
    startedAt,
    status: "completed",
    traceContext: trace,
  } as never);
  assert.deepEqual(gated.logger.records, [], "四方法缺一静默返回");

  // 记账口径：id/两处 logical 兜底分隔符/token 映射/retryCount。
  const full = createMethodsRuntime();
  const { calls, store } = recordingStore();
  (full.runtime as unknown as Record<string, unknown>).sessionStore = store;
  await usage.recordModelUsageFact(full.runtime, {
    assistantMessageId: "assistant-msg-0001",
    attemptIndex: 2,
    error: Object.assign(new Error("model broke"), { code: "model_server_error" }),
    events,
    model: { modelId: "model-contract", options: {}, providerId: "provider-contract" },
    networkEventStartIndex: 0,
    querySource: "main_turn",
    result: {
      usage: {
        cacheReadTokens: 11,
        cacheWriteTokens: 22,
        inputTokens: 33,
        outputTokens: 44,
        reasoningTokens: 5,
        totalTokens: 99,
      },
    },
    startedAt,
    status: "error",
    traceContext: trace,
  } as never);
  const modelCall = calls.find((entry) => entry.method === "recordModelUsage");
  assert.ok(modelCall, "写入 recordModelUsage");
  const record = modelCall?.args[0] as Record<string, unknown>;
  assert.equal(record.id, "usage_model_main_turn_assistant-msg-0001_2");
  assert.equal(record.logicalRequestId, "assistant-msg-0001");
  assert.equal(record.inputTokens, 33);
  assert.equal(record.outputTokens, 44);
  assert.equal(record.reasoningTokens, 5);
  assert.equal(record.cacheCreationInputTokens, 22, "cacheWriteTokens → cacheCreationInputTokens");
  assert.equal(record.cacheReadInputTokens, 11);
  assert.equal(record.providerTotalTokens, 99);
  assert.equal(record.retryCount, 1, "model_retry_scheduled 计数");
  assert.equal(record.cancelledByUser, false);
  assert.equal(record.querySource, "main_turn");

  // 无 assistantMessageId：logical 用 `_` 分隔符、logicalRequestId 用 `:`（语义常量）。
  const fallback = createMethodsRuntime();
  const fallbackRecording = recordingStore();
  (fallback.runtime as unknown as Record<string, unknown>).sessionStore = fallbackRecording.store;
  await usage.recordModelUsageFact(fallback.runtime, {
    events: [],
    model: { modelId: "m", options: {}, providerId: "p" },
    networkEventStartIndex: 0,
    querySource: "compact",
    startedAt,
    status: "cancelled",
    traceContext: { traceId: "trace-contract-0001", turnId: "turn-contract-0001" },
  } as never);
  const fallbackRecord = fallbackRecording.calls[0]?.args[0] as Record<string, unknown>;
  assert.ok(String(fallbackRecord.id).includes("compact_"), "id 含 querySource");
  assert.ok(
    String(fallbackRecord.id).slice("usage_model_compact_".length).includes("_"),
    "logical 兜底分隔符 `_`",
  );
  assert.ok(
    String(fallbackRecord.logicalRequestId).includes(":"),
    "logicalRequestId 兜底分隔符 `:`",
  );
  assert.equal(fallbackRecord.cancelledByUser, true);
});

test("B29 回合用量事实", async () => {
  const usage = await methods("usage-observability");
  const fake = createMethodsRuntime();
  const { calls, store } = recordingStore();
  (fake.runtime as unknown as Record<string, unknown>).sessionStore = store;
  const events = [
    { type: SessionEventType.ModelRequest, payload: {}, timestamp: new Date(1_000) },
    { type: SessionEventType.ModelRequest, payload: {}, timestamp: new Date(2_000) },
    { type: SessionEventType.ModelNetworkStatus, payload: { type: "model_retry_scheduled" } },
    { type: SessionEventType.ToolCallScheduled, payload: { toolCallId: "call-1" } },
    { type: SessionEventType.ToolCallScheduled, payload: { toolCallId: "call-1" } },
    { type: SessionEventType.ToolCallScheduled, payload: { toolCallId: "call-2" } },
    {
      type: SessionEventType.ToolCallError,
      payload: { toolCallId: "call-1", error: { type: "ToolExecutionFailed" } },
    },
    {
      type: SessionEventType.ToolCallError,
      payload: { toolCallId: "call-1", error: { type: "ToolExecutionFailed" } },
    },
  ];
  await usage.recordTurnUsageFact(fake.runtime, {
    completedAt: 5_000,
    events,
    startedAt: 1_000,
    status: "completed",
    traceContext: trace,
    turnId: "turn-contract-0001",
    userMessageId: "user-msg-0001",
  } as never);
  const turnCall = calls.find((entry) => entry.method === "upsertTurnUsage");
  assert.ok(turnCall, "写入 upsertTurnUsage");
  const record = turnCall?.args[0] as Record<string, unknown>;
  assert.equal(record.modelRequestCount, 2);
  assert.equal(record.modelRetryCount, 1);
  assert.equal(record.toolCallCount, 2, "ToolCallScheduled 去重 toolCallId");
  assert.equal(record.toolErrorCount, 1, "ToolCallError 去重 toolCallId");
  assert.equal(record.durationMs, 4_000, "completedAt - startedAt");
});

test("B30 工具用量事实", async () => {
  const usage = await methods("usage-observability");
  const run = async (event: Record<string, unknown>) => {
    const fake = createMethodsRuntime();
    const { calls, store } = recordingStore();
    (fake.runtime as unknown as Record<string, unknown>).sessionStore = store;
    await usage.recordToolUsageFromEvent(fake.runtime, event, trace);
    return calls.find((entry) => entry.method === "upsertToolUsage")?.args[0] as
      | Record<string, unknown>
      | undefined;
  };

  // 无 toolCallId / 空串直接返回。
  assert.equal(await run({ type: SessionEventType.ToolCallScheduled, payload: {} }), undefined);
  assert.equal(
    await run({ type: SessionEventType.ToolCallScheduled, payload: { toolCallId: "" } }),
    undefined,
  );

  const scheduled = (await run({
    type: SessionEventType.ToolCallScheduled,
    payload: { toolCallId: "call-1", toolName: "tool-alpha" },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(scheduled.id, "usage_tool_session-contract-0001_call-1");
  assert.equal(scheduled.toolName, "tool-alpha");
  assert.equal(scheduled.status, "running");
  assert.equal(scheduled.approvalStatus, "none");

  const denied = (await run({
    type: SessionEventType.PermissionDenied,
    payload: { toolCallId: "call-2", toolName: "tool-alpha" },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(denied.status, "error");
  assert.equal(denied.approvalStatus, "denied");

  const resolved = (await run({
    type: SessionEventType.PermissionResolved,
    payload: { toolCallId: "call-3", decision: "deny" },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(resolved.status, "running");
  assert.equal(resolved.approvalStatus, "denied");

  const completed = (await run({
    type: SessionEventType.ToolCallResult,
    payload: {
      toolCallId: "call-4",
      toolName: "tool-alpha",
      duration: 12.7,
      result: { returnedBytes: 100, truncated: true },
    },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(completed.status, "completed");
  assert.equal(completed.durationMs, 12, "usageCount 截断口径");
  assert.equal(completed.outputBytes, 100);
  assert.equal(completed.truncated, true);

  const errored = (await run({
    type: SessionEventType.ToolCallError,
    payload: {
      toolCallId: "call-5",
      toolName: "tool-alpha",
      error: { type: "operation_cancelled", message: "cancelled" },
    },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(errored.status, "cancelled", "errorType 含 cancel 归 cancelled");
  assert.equal(errored.cancelledByUser, true);

  const failed = (await run({
    type: SessionEventType.ToolCallError,
    payload: {
      toolCallId: "call-6",
      toolName: "",
      error: { message: "boom" },
    },
    timestamp: new Date(7_000),
  })) as Record<string, unknown>;
  assert.equal(failed.toolName, "unknown", "toolName 缺省 unknown");
  assert.equal(failed.status, "error");
  assert.equal(failed.cancelledByUser, false);
});

test("B31 用量投影纯函数", async () => {
  const projection = await methods("usage-observability-projection");
  const events = [
    {
      type: SessionEventType.ModelNetworkStatus,
      payload: { type: "model_retry_scheduled", reason: "rate_limited" },
    },
    { type: SessionEventType.ModelNetworkStatus, payload: { note: "no type" } },
    {
      type: SessionEventType.ModelStreaming,
      payload: { kind: "text_delta", delta: "" },
      timestamp: new Date(10),
    },
    {
      type: SessionEventType.ModelStreaming,
      payload: { kind: "reasoning_delta", delta: "x" },
      timestamp: new Date(42),
    },
  ] as never;

  assert.deepEqual(projection.modelNetworkObservations(events), [
    { type: "model_retry_scheduled", reason: "rate_limited" },
  ]);
  assert.equal(projection.firstModelTokenAt(events, 0), 42, "delta.length > 0 才算首 token");
  assert.equal(projection.firstModelTokenAt([], 0), undefined);

  const coreError = Object.assign(new Error("limited"), {
    code: "model_rate_limited",
    recoverable: true,
    retryable: false,
    type: CoreErrorType.ModelError,
  });
  const coreInfo = projection.usageErrorInfo(coreError, undefined);
  assert.equal(coreInfo.type, CoreErrorType.ModelError);
  assert.equal(coreInfo.message, "limited");
  assert.equal(coreInfo.retryable, false);
  assert.equal(coreInfo.code, "model_rate_limited");
  assert.deepEqual(
    projection.usageErrorInfo(new Error("plain"), { retryable: true, reason: "network_error" }),
    { message: "plain", retryable: true, type: "network_error" },
  );
  assert.deepEqual(
    projection.usageErrorInfo(undefined, {
      message: "failed",
      retryable: false,
      reason: "timeout",
    }),
    { message: "failed", retryable: false, type: "timeout" },
  );
  assert.deepEqual(projection.usageErrorInfo(undefined, undefined), {});

  assert.equal(projection.nonemptyString("x"), "x");
  assert.equal(projection.nonemptyString(""), undefined);
  assert.equal(projection.nonemptyString(5), undefined);
  assert.equal(projection.usageCount(12.9), 12);
  assert.equal(projection.usageCount(-3), 0);
  assert.equal(projection.usageCount(Number.NaN), 0);
});

test("B28 流事件→用量/账本金样往返", async () => {
  const golden = JSON.parse(
    readFileSync(join(contractDir, "fixtures/stream-usage-roundtrip.json"), "utf8"),
  ) as {
    modelFact: Record<string, unknown>;
    toolFacts: Record<string, unknown>[];
    turnFact: Record<string, unknown>;
  };
  const usage = await methods("usage-observability");
  const fake = createMethodsRuntime();
  const { calls, store } = recordingStore();
  (fake.runtime as unknown as Record<string, unknown>).sessionStore = store;
  const networkEvents = [
    { type: SessionEventType.ModelNetworkStatus, payload: { type: "model_request_started" } },
    {
      type: SessionEventType.ModelNetworkStatus,
      payload: { type: "model_retry_scheduled", reason: "rate_limited" },
    },
    {
      type: SessionEventType.ModelNetworkStatus,
      payload: { type: "model_request_failed", reason: "network_error", retryable: false },
    },
    {
      type: SessionEventType.ModelStreaming,
      payload: { kind: "text_delta", delta: "tok" },
      timestamp: new Date(1_700_000_000_100),
    },
  ];
  const toolEvents = [
    {
      type: SessionEventType.ToolCallScheduled,
      payload: { toolCallId: "call-1", toolName: "lookup" },
      timestamp: new Date(1_700_000_000_200),
    },
    {
      type: SessionEventType.ToolCallResult,
      payload: {
        toolCallId: "call-1",
        toolName: "lookup",
        duration: 12.7,
        result: { returnedBytes: 100, truncated: true },
      },
      timestamp: new Date(1_700_000_000_300),
    },
  ];
  await usage.recordModelUsageFact(fake.runtime, {
    assistantMessageId: "assistant-msg-0001",
    attemptIndex: 1,
    events: networkEvents,
    model: { modelId: "model-fixture", options: {}, providerId: "provider-fixture" },
    networkEventStartIndex: 0,
    querySource: "main_turn",
    result: {
      finishReason: "stop",
      usage: {
        cacheReadTokens: 11,
        cacheWriteTokens: 22,
        inputTokens: 33,
        outputTokens: 44,
        reasoningTokens: 5,
        totalTokens: 99,
      },
    },
    startedAt: 1_700_000_000_000,
    status: "completed",
    traceContext: trace,
  } as never);
  for (const event of toolEvents) {
    await usage.recordToolUsageFromEvent(fake.runtime, event as never, trace);
  }
  await usage.recordTurnUsageFact(fake.runtime, {
    completedAt: 1_700_000_005_000,
    events: [...networkEvents, ...toolEvents],
    startedAt: 1_700_000_000_000,
    status: "completed",
    traceContext: trace,
    turnId: "turn-contract-0001",
    userMessageId: "user-msg-0001",
  } as never);

  const liveModelFact = JSON.parse(
    JSON.stringify(calls.find((entry) => entry.method === "recordModelUsage")?.args[0]),
  ) as Record<string, unknown>;
  liveModelFact.completedAt = "<completedAt>";
  liveModelFact.durationMs = "<durationMs>";
  assert.deepEqual(liveModelFact, golden.modelFact, "模型用量事实与金样一致");
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        calls.filter((entry) => entry.method === "upsertToolUsage").map((entry) => entry.args[0]),
      ),
    ),
    golden.toolFacts,
    "工具用量账本与金样一致",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.find((entry) => entry.method === "upsertTurnUsage")?.args[0])),
    golden.turnFact,
    "回合用量事实与金样一致",
  );
});
