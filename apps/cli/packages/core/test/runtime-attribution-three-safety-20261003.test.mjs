import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => fs.readFile(new URL(p, core), "utf8"),
  baselines = {
    background: "98f7010aa664a834bf79675d7ed83aa5ddd99955ee730d7558fd1241e59a594f",
    "model-status": "1589939e9229f7261046fa473f5be51ac38efeeffabc772b07ff6f13ded691e8",
    "usage-observability": "917c7909aabdd7753a4e3bd5744dea9b324c1b21cfa26982ccdc2c1dd3e13446",
  },
  old = {};
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const bind = (s) =>
  s.replace(
    /from "([^"]+)"/gu,
    (_, p) =>
      `from ${JSON.stringify(p.startsWith(".") ? new URL("dist/runtime/methods/" + p, core).href : import.meta.resolve(p))}`,
  );
for (const [n, pin] of Object.entries(baselines)) {
  const t = await read("test/runtime-" + n + "-baseline-20261003.json");
  assert.equal(hash(t), pin);
  const f = JSON.parse(t).files[n];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  old[n] = await import(data(bind(f.compiled)));
}
async function observe(o) {
  const deps = await import(new URL("dist/runtime/deps.js", core)),
    trace = { traceId: "caller-trace", turnId: "caller-turn" },
    facts = {};
  const NativeDate = globalThis.Date;
  globalThis.Date = class extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [100]));
    }
    static now() {
      return 100;
    }
  };
  try {
    // A failed cancel must leave the accepted request event; it must not publish completion.
    {
      const calls = [],
        failure = Error("Owned cancellation"),
        task = {
          taskId: "owned-task",
          type: "local_bash",
          status: "running",
          isBackgrounded: true,
          description: "Owned command",
        },
        existing = {
          taskId: task.taskId,
          status: "running",
          toolName: "Bash",
          command: "Owned command",
        };
      const runtime = {
        rootTraceContext: trace,
        runtimeTaskRegistry: {
          get(id) {
            assert.equal(id, task.taskId);
            calls.push("get");
            return task;
          },
        },
        async rebuildProjection() {
          calls.push("projection");
          return { backgroundTasks: [existing] };
        },
        buildBackgroundTaskPayload: o.background.buildBackgroundTaskPayload,
        createEvent(type, payload, t) {
          assert.equal(t, trace);
          calls.push("create");
          assert.equal(payload.cancellable, false);
          return { type, payload };
        },
        async appendEvent(e, t) {
          assert.equal(t, trace);
          calls.push(e.type);
          assert.equal(e.payload.status, "running");
        },
        executionPort: {
          async cancelBackgroundTask(id) {
            assert.equal(this, runtime.executionPort);
            assert.equal(id, task.taskId);
            calls.push("cancel");
            throw failure;
          },
        },
      };
      await assert.rejects(
        o.background.stopBackgroundTask.call(runtime, task.taskId, { traceContext: trace }),
        (e) => e === failure,
      );
      assert.deepEqual(calls, [
        "get",
        "projection",
        "create",
        deps.SessionEventType.BackgroundTaskUpdated,
        "cancel",
      ]);
      facts.background = calls;
    }
    // Callback mutation flows into the event; rejected append never enters accepted events.
    {
      const order = [],
        accepted = [],
        failure = Error("Owned append"),
        recovery = { anchorId: "owned" },
        status = {
          type: "model_request_started",
          attempt: 1,
          providerId: "owned",
          modelId: "owned",
        },
        runtime = {
          logModelNetworkStatus(payload, t) {
            assert.equal(t, trace);
            order.push("log");
            assert.equal(payload.attempt, 2);
          },
          createEvent(type, payload, t) {
            order.push("create");
            return { type, payload };
          },
          async appendEvent(e, t) {
            order.push("append");
            throw failure;
          },
        };
      const sink = o["model-status"].createModelStatusSink.call(runtime, trace, accepted, {
        streamRecovery: recovery,
        onStatus(payload) {
          order.push("callback");
          assert.notEqual(payload, status);
          assert.equal(payload.streamRecovery, recovery);
          payload.attempt = 2;
        },
      });
      await assert.rejects(sink.publish.call({ owned: "other" }, status), (e) => e === failure);
      assert.deepEqual(accepted, []);
      assert.deepEqual(order, ["callback", "log", "create", "append"]);
      facts.modelStatus = order;
    }
    // Three fact writers retain IDs/raw references and swallow only owned write failures with warnings.
    {
      const rows = [],
        warnings = [],
        failure = Error("Owned fact write"),
        usage = { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
        model = {
          providerId: "owned-provider",
          modelId: "owned-model",
          options: { reasoningLevel: "low" },
        },
        metadata = { readOnly: true, destructive: false, sideEffectScope: "none" };
      const store = {
        async recordModelUsage(row) {
          assert.equal(this, store);
          assert.equal(row.rawUsage, usage);
          rows.push(row);
          throw failure;
        },
        async upsertTurnUsage(row) {
          assert.equal(this, store);
          rows.push(row);
          throw failure;
        },
        async upsertToolUsage(row) {
          assert.equal(this, store);
          rows.push(row);
          throw failure;
        },
        async pruneUsage() {
          throw Error("Not requested");
        },
      };
      const runtime = {
        sessionId: "owned-session",
        sessionStore: store,
        config: {},
        registry: {
          get(name) {
            assert.equal(name, "OwnedTool");
            return { metadata };
          },
        },
        logger: {
          warn(label, payload) {
            assert.equal(payload.errorMessage, failure.message);
            warnings.push({ label, ...payload });
          },
        },
      };
      const events = [
        { type: deps.SessionEventType.ModelRequest, timestamp: new Date(10), payload: {} },
        {
          type: deps.SessionEventType.ModelStreaming,
          timestamp: new Date(20),
          payload: { kind: "text_delta", delta: "Owned" },
        },
        {
          type: deps.SessionEventType.ModelNetworkStatus,
          timestamp: new Date(21),
          payload: { type: "model_retry_scheduled" },
        },
        { type: deps.SessionEventType.ModelComplete, timestamp: new Date(30), payload: { usage } },
        {
          type: deps.SessionEventType.ToolCallScheduled,
          timestamp: new Date(31),
          payload: { toolCallId: "owned-tool" },
        },
        {
          type: deps.SessionEventType.ToolCallScheduled,
          timestamp: new Date(32),
          payload: { toolCallId: "owned-tool" },
        },
      ];
      await o["usage-observability"].recordModelUsageFact(runtime, {
        events,
        model,
        querySource: "owned-query",
        startedAt: 10,
        status: "completed",
        networkEventStartIndex: 0,
        result: { text: "Owned", finishReason: "stop", usage },
        traceContext: trace,
      });
      assert.equal(rows[0].id, "usage_model_owned-query_owned-query_10_0");
      assert.equal(rows[0].logicalRequestId, "owned-query:10");
      assert.equal(rows[0].retryCount, 1);
      assert.equal(rows[0].firstTokenAt, 20);
      await o["usage-observability"].recordTurnUsageFact(runtime, {
        events,
        startedAt: 10,
        completedAt: 50,
        status: "completed",
        turnId: "owned-turn",
        traceContext: trace,
      });
      assert.equal(rows[1].toolCallCount, 1);
      assert.equal(rows[1].modelRetryCount, 1);
      await o["usage-observability"].recordToolUsageFromEvent(
        runtime,
        {
          type: deps.SessionEventType.ToolCallError,
          traceId: "stored-trace",
          turnId: "stored-turn",
          timestamp: new Date(40),
          payload: {
            toolCallId: "owned-tool",
            toolName: "OwnedTool",
            error: { type: "tool_cancelled", code: "owned-code", message: "Owned interruption" },
          },
        },
        trace,
      );
      assert.equal(rows[2].traceID, "stored-trace");
      assert.equal(rows[2].turnID, "stored-turn");
      assert.equal(rows[2].status, "cancelled");
      assert.equal(rows[2].cancelledByUser, true);
      assert.equal(rows.length, 3);
      assert.equal(warnings.length, 3);
      facts.usage = { rows, warnings };
    }
    return facts;
  } finally {
    globalThis.Date = NativeDate;
  }
}
console.log(
  JSON.stringify({
    mode: "immutable predecessor actual compiler emitted",
    syntheticWriteLifecycleGroups: 3,
    usageRowsWithinGroup: 3,
    observations: await observe(old),
  }),
);
