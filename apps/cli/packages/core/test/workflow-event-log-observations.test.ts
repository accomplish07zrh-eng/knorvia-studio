import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import {
  current,
  actual,
  historical,
  consumer,
  pins,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-event-log-fixture.js";
import { gate, ports, snapshot } from "./workflow-scheduler-observation-ports.js";
const observations: Record<string, unknown> = {};
after(() => {
  if (process.env.KNORVIA_EVENT_LOG_RECORD_OBSERVATIONS === "1")
    console.log(`OWNED_EVENT_LOG_OBSERVATIONS ${JSON.stringify(observations)}`);
});

test(`${surface}: captured ports, receivers, clock and ordered primitive shapes`, async () => {
  const p = ports(snapshot([])),
    trace: string[] = [],
    records: any[] = [],
    events: any[] = [];
  let owner: InstanceType<typeof current.WorkflowSchedulerEventLog>,
    tick = 0;
  const captured = {
    appendEvent(event: any, settings: any) {
      assert.equal(this, owner);
      events.push(event);
      trace.push("appendEvent");
      assert.deepEqual(Object.keys(settings), ["signal"]);
      assert.equal(settings.signal, undefined);
      return Promise.resolve();
    },
    appendGraphRecord(runId: string, record: any, settings: any) {
      assert.equal(this, owner);
      records.push(record);
      trace.push("appendGraphRecord");
      assert.equal(runId, p.options.snapshot.runId);
      assert.deepEqual(Object.keys(settings), ["signal"]);
      assert.equal(settings.signal, p.controller.signal);
      return Promise.resolve();
    },
    now() {
      assert.equal(this, owner);
      trace.push(`clock:${tick}`);
      return new Date(tick++ * 1000);
    },
    onWorkflowEvent(event: any) {
      assert.equal(this, owner);
      assert.equal(event, events[0]);
      trace.push("callback");
    },
  };
  for (const name of Object.keys(captured) as (keyof typeof captured)[])
    Object.defineProperty(p.deps, name, {
      configurable: true,
      get() {
        assert.equal(this, p.deps);
        trace.push(`capture:${name}`);
        return captured[name];
      },
    });
  owner = new current.WorkflowSchedulerEventLog(p.deps);
  assert.deepEqual(trace, [
    "capture:appendEvent",
    "capture:appendGraphRecord",
    "capture:now",
    "capture:onWorkflowEvent",
  ]);
  for (const name of Object.keys(captured))
    Object.defineProperty(p.deps, name, {
      value() {
        throw new Error("Replacement must remain unused");
      },
    });
  assert.equal(owner.timestamp(), "1970-01-01T00:00:00.000Z");
  p.controller.abort(new Error("Owned pre-abort forwarded without admission"));
  assert.equal(
    await owner.appendGraphStatus(
      p.options.snapshot,
      "a",
      "execute",
      "active",
      p.controller.signal,
    ),
    undefined,
  );
  assert.deepEqual(Object.keys(records[0]), [
    "nodeId",
    "phase",
    "recordType",
    "runId",
    "status",
    "timestamp",
    "type",
  ]);
  assert.deepEqual(records[0], {
    nodeId: "a",
    phase: "execute",
    recordType: "op",
    runId: "owned-run",
    status: "active",
    timestamp: "1970-01-01T00:00:01.000Z",
    type: "update_status",
  });
  assert.equal(await owner.emitEvent(p.options.snapshot, "frontier_changed"), undefined);
  assert.deepEqual(Object.keys(events[0]), [
    "kind",
    "message",
    "nodeId",
    "payload",
    "phase",
    "runId",
    "timestamp",
    "type",
  ]);
  assert.deepEqual(events[0], {
    kind: "expert",
    message: undefined,
    nodeId: undefined,
    payload: undefined,
    phase: undefined,
    runId: "owned-run",
    timestamp: "1970-01-01T00:00:02.000Z",
    type: "frontier_changed",
  });
  observations.captureAndShapes = {
    trace,
    recordKeys: Object.keys(records[0]),
    record: records[0],
    eventKeys: Object.keys(events[0]),
    eventDefinedFields: {
      kind: events[0].kind,
      runId: events[0].runId,
      timestamp: events[0].timestamp,
      type: events[0].type,
    },
    ownUndefinedEventFields: ["message", "nodeId", "payload", "phase"],
    signalKeys: ["signal"],
    receivers: "EventLog instance",
    preAbortedSignal: "forwarded, no owner guard",
  };
});

test(`${surface}: append/callback gates and exact partial errors`, async () => {
  const p = ports(snapshot([])),
    append = gate<void>(),
    callback = gate<void>(),
    entered = gate<void>();
  const payload = { owned: true };
  let settled = false;
  p.hooks.event = () => append.promise;
  p.deps.onWorkflowEvent = function (event) {
    assert.equal(event, p.events[0]);
    entered.resolve();
    return callback.promise;
  };
  const log = new current.WorkflowSchedulerEventLog(p.deps);
  const pending = log.emitEvent(p.options.snapshot, "node_started", {
    message: "Owned event",
    nodeId: "a",
    payload,
    phase: "execute",
    signal: p.controller.signal,
  });
  pending.then(() => {
    settled = true;
  });
  assert.equal(p.events[0]?.payload, payload);
  assert.equal(p.events[0]?.message, "Owned event");
  assert.equal(p.events[0]?.nodeId, "a");
  assert.equal(p.events[0]?.phase, "execute");
  assert.equal(settled, false);
  append.resolve();
  await entered.promise;
  assert.equal(settled, false);
  callback.resolve();
  assert.equal(await pending, undefined);
  assert.equal(settled, true);
  const errors = [];
  for (const stage of [
    "append-throw",
    "append-reject",
    "callback-throw",
    "callback-reject",
  ] as const) {
    const q = ports(snapshot([])),
      reason = new Error(`Owned ${stage}`);
    let callbacks = 0;
    q.deps.onWorkflowEvent = () => {
      callbacks++;
      if (stage === "callback-throw") throw reason;
      if (stage === "callback-reject") return Promise.reject(reason);
    };
    q.hooks.event = () => {
      if (stage === "append-throw") throw reason;
      if (stage === "append-reject") return Promise.reject(reason);
      return Promise.resolve();
    };
    await assert.rejects(
      new current.WorkflowSchedulerEventLog(q.deps).emitEvent(
        q.options.snapshot,
        "frontier_changed",
        { signal: q.controller.signal },
      ),
      (error) => error === reason,
    );
    assert.equal(q.events.length, 1);
    assert.equal(callbacks, stage.startsWith("callback") ? 1 : 0);
    errors.push({ stage, exactError: true, partialAppend: 1, callbacks });
  }
  const q = ports(snapshot([])),
    reason = new Error("Owned clock failure");
  q.deps.now = () => {
    throw reason;
  };
  const broken = new current.WorkflowSchedulerEventLog(q.deps);
  assert.throws(
    () => broken.timestamp(),
    (error) => error === reason,
  );
  await assert.rejects(
    broken.appendGraphStatus(q.options.snapshot, "a", "execute", "active"),
    (error) => error === reason,
  );
  await assert.rejects(
    broken.emitEvent(q.options.snapshot, "frontier_changed"),
    (error) => error === reason,
  );
  assert.deepEqual(q.events, []);
  assert.deepEqual(q.trace, []);
  observations.gatesAndErrors = {
    appendBeforeCallback: true,
    bothNativeGatesRequired: true,
    exactPayloadAndEventIdentity: true,
    errors,
    clockFailure: "sync timestamp throw; async method rejection; zero append/callback",
  };
});

test(`${surface}: absent callback still yields and concurrent appends are independent`, async () => {
  const p = ports(snapshot([])),
    trace: string[] = [],
    ticks = gate<void>();
  delete p.deps.onWorkflowEvent;
  p.deps.now = () => new Date(0);
  p.deps.appendEvent = () => {
    trace.push("append");
    return Promise.resolve();
  };
  const pending = new current.WorkflowSchedulerEventLog(p.deps).emitEvent(
    p.options.snapshot,
    "frontier_changed",
  );
  pending.then(() => trace.push("done"));
  queueMicrotask(() => {
    trace.push("tick1");
    queueMicrotask(() => {
      trace.push("tick2");
      queueMicrotask(() => {
        trace.push("tick3");
        ticks.resolve();
      });
    });
  });
  await Promise.all([pending, ticks.promise]);
  assert.deepEqual(trace, ["append", "tick1", "tick2", "done", "tick3"]);
  const q = ports(snapshot([])),
    order: string[] = [],
    a = gate<void>(),
    b = gate<void>();
  const events: any[] = [];
  q.deps.appendEvent = (event) => {
    events.push(event);
    order.push(`append:${event.nodeId}`);
    return event.nodeId === "a" ? a.promise : b.promise;
  };
  q.deps.onWorkflowEvent = (event) => {
    assert.equal(
      events.find((e) => e.nodeId === event.nodeId),
      event,
    );
    order.push(`callback:${event.nodeId}`);
  };
  const log = new current.WorkflowSchedulerEventLog(q.deps);
  const one = log
    .emitEvent(q.options.snapshot, "node_started", { nodeId: "a" })
    .then(() => order.push("done:a"));
  const two = log
    .emitEvent(q.options.snapshot, "node_started", { nodeId: "b" })
    .then(() => order.push("done:b"));
  assert.deepEqual(order, ["append:a", "append:b"]);
  b.resolve();
  await two;
  a.resolve();
  await one;
  assert.deepEqual(order, ["append:a", "append:b", "callback:b", "done:b", "callback:a", "done:a"]);
  observations.nativeAndConcurrent = {
    missingCallback: trace,
    concurrency: order,
    sharedQueue: false,
    callbackEventIdentity: true,
  };
});

test(`${surface}: strict current/actual consumer and historical selection fail closed`, async () => {
  assert.equal(current.WorkflowSchedulerEventLog, actual.WorkflowSchedulerEventLog);
  assert.notEqual(current.WorkflowSchedulerEventLog, historical.WorkflowSchedulerEventLog);
  assert.equal(typeof consumer.WorkflowGraphScheduler, "function");
  const read = (url: URL) => readFile(url, "utf8");
  for (const path of [
    "src/workflow/scheduler/events.ts",
    "dist/workflow/scheduler/events.js",
    "dist/workflow/scheduler/events.d.ts",
    "src/workflow/scheduler.ts",
  ]) {
    await assert.rejects(
      loadCurrent(async (url) => (url.href.endsWith(path) ? `${await read(url)} ` : read(url))),
    );
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.href.endsWith(path)) throw new Error("Owned missing artifact");
        return read(url);
      }),
    );
  }
  await assert.rejects(loadHistorical(async () => "{}"));
  await assert.rejects(
    loadHistorical(async () => {
      throw new Error("Owned missing oracle");
    }),
  );
  observations.selection = {
    files: Object.keys(pins.files).length,
    distinctHistoricalClass: true,
    actualCurrentClass: true,
    currentConsumerImported: true,
    rejectionControls: 10,
  };
});
