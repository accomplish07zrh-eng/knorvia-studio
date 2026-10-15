// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：事件管线、sink 通知、会话持久化与追加汇总（B23–B25/B27）。
// B23/B25 的日志序列与 B24 的串行通知都用 gate 握手断言，无 sleep、无固定超时。
import assert from "node:assert/strict";
import test from "node:test";
import { contractsBundle, methods } from "./entry.mjs";
import { createMethodsRuntime, type FakeMethodsRuntime } from "./fixtures.js";

const { SessionEventType } = await contractsBundle();
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
