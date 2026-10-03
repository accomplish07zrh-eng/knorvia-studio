import assert from "node:assert/strict";
import test from "node:test";
import { current, surface } from "./workflow-scheduler-observation-fixture.js";
import { gate, node, ports, snapshot } from "./workflow-scheduler-observation-ports.js";
const flush = async () => {
  for (let n = 0; n < 30; n++) await Promise.resolve();
};

test(`${surface}: scope, resume repair, terminal priority and deadlock`, async () => {
  const empty = ports(snapshot([node("excluded")]));
  empty.options.executableNodeIds = [];
  const queuedAbort = new Error("Owned terminal publication abort");
  empty.hooks.event = (event) => {
    if (event.type === "executor_completed")
      queueMicrotask(() => empty.controller.abort(queuedAbort));
    return Promise.resolve();
  };
  const completed = await new current.WorkflowGraphScheduler(empty.deps).run(empty.options);
  assert.equal(completed.snapshot, empty.options.snapshot);
  assert.deepEqual(
    { reason: completed.reason, status: completed.status },
    { reason: "completed", status: "completed" },
  );
  assert.equal(empty.controller.signal.aborted, true);
  assert.deepEqual(
    empty.events.map((e) => e.type),
    ["frontier_changed", "executor_completed"],
  );
  assert.equal(empty.events[1]?.message, "execute scheduler completed.");
  assert.equal(empty.writes.length, 0);
  assert.equal(empty.requests.length, 0);
  assert.equal(empty.trace[0], "clock:0");

  const initial = snapshot([
    node("a", { status: "active", phase: "execute" }),
    node("outside", { status: "active" }),
  ]);
  initial.phases = [{ phase: "execute", status: "active" }];
  initial.activities = [
    {
      activityId: "owned-a",
      nodeId: "a",
      kind: "agent_session",
      phase: "execute",
      status: "active",
      startedAt: "seed",
      inputArtifactPaths: [],
      outputArtifactPaths: [],
    },
  ];
  const repaired = ports(initial),
    reason = new Error("Owned pre-abort");
  repaired.options.executableNodeIds = ["a", "a", "missing"];
  repaired.controller.abort(reason);
  let receiver: unknown;
  const write = repaired.deps.writeSnapshot;
  repaired.deps.writeSnapshot = function (value, settings) {
    receiver = this;
    return write(value, settings);
  };
  const capturedOwner = new current.WorkflowGraphScheduler(repaired.deps);
  await assert.rejects(capturedOwner.run(repaired.options), (error) => error === reason);
  assert.equal(receiver, capturedOwner);
  assert.equal(repaired.writes.length, 1);
  assert.equal(repaired.writes[0]?.graph.nodes[0]?.status, "pending");
  assert.equal(repaired.writes[0]?.graph.nodes[1], initial.graph.nodes[1]);
  assert.equal(repaired.writes[0]?.phases[0], initial.phases[0]);
  assert.equal(repaired.writes[0]?.activities[0]?.status, "cancelled");
  assert.equal(initial.graph.nodes[0]?.status, "active");
  assert.deepEqual(repaired.events, []);

  const blocked = ports(snapshot([node("a", { dependsOn: ["outside"] }), node("outside")]));
  blocked.options.executableNodeIds = ["a"];
  const paused = await new current.WorkflowGraphScheduler(blocked.deps).run(blocked.options);
  assert.equal(paused.snapshot, blocked.options.snapshot);
  assert.deepEqual(
    { reason: paused.reason, status: paused.status },
    { reason: "deadlock", status: "paused" },
  );
  assert.deepEqual(
    blocked.events.map((e) => e.type),
    ["frontier_changed", "executor_paused"],
  );
  assert.deepEqual(blocked.events[1]?.payload, {
    blockedNodes: [{ blockedBy: ["outside"], nodeId: "a" }],
  });
  assert.equal(
    blocked.events[1]?.message,
    "execute scheduler paused because pending nodes are blocked.",
  );
});

test(`${surface}: started gate serializes admission, native completions reuse bounded slots`, async () => {
  const p = ports(snapshot([node("a"), node("b"), node("c")]));
  const firstWrite = gate<void>(),
    bStarted = gate<void>(),
    cStarted = gate<void>();
  const holds = {
    a: gate<typeof p.result>(),
    b: gate<typeof p.result>(),
    c: gate<typeof p.result>(),
  };
  let held = false;
  p.hooks.write = (value) => {
    if (!held && value.graph.nodes[0]?.status === "active") {
      held = true;
      return firstWrite.promise;
    }
    return Promise.resolve();
  };
  p.hooks.run = (input) => {
    assert.equal(input.abortSignal, p.controller.signal);
    assert.equal(
      input.node,
      p.options.snapshot.graph.nodes.find((n) => n.id === input.node.id),
    );
    if (input.node.id === "b") bStarted.resolve();
    if (input.node.id === "c") cStarted.resolve();
    return holds[input.node.id as keyof typeof holds].promise;
  };
  const pending = new current.WorkflowGraphScheduler(p.deps).run(p.options);
  await flush();
  assert.equal(p.writes.length, 1);
  assert.equal(p.requests.length, 0);
  firstWrite.resolve();
  await bStarted.promise;
  assert.deepEqual(
    p.requests.map((r) => r.node.id),
    ["a", "b"],
  );
  holds.b.resolve(p.result);
  await cStarted.promise;
  assert.deepEqual(
    p.requests.map((r) => r.node.id),
    ["a", "b", "c"],
  );
  assert.equal(p.writes.at(-1)?.graph.nodes[0]?.status, "active");
  assert.equal(p.writes.at(-1)?.graph.nodes[1]?.status, "completed");
  holds.a.resolve(p.result);
  await flush();
  holds.c.resolve(p.result);
  const result = await pending;
  assert.equal(result.reason, "completed");
  assert.equal(result.snapshot, p.writes.at(-1));
  assert.deepEqual(
    result.snapshot.graph.nodes.map((n) => n.status),
    ["completed", "completed", "completed"],
  );
  assert.deepEqual(
    p.events.filter((e) => e.type === "node_completed").map((e) => e.nodeId),
    ["b", "a", "c"],
  );
});

test(`${surface}: error threshold drains live work and successes reset observed error count`, async () => {
  const p = ports(snapshot([node("a"), node("b")]));
  p.options.snapshot.strategy.executor.maxConsecutiveErrors = 1;
  const a = gate<typeof p.result>(),
    b = gate<typeof p.result>(),
    both = gate<void>();
  p.hooks.run = (input) => {
    if (input.node.id === "b") both.resolve();
    return input.node.id === "a" ? a.promise : b.promise;
  };
  const pending = new current.WorkflowGraphScheduler(p.deps).run(p.options);
  await both.promise;
  a.reject(new Error("Owned failure"));
  await flush();
  assert.equal(
    p.events.some((e) => e.type === "executor_paused"),
    false,
  );
  assert.equal(p.writes.at(-1)?.graph.nodes[0]?.status, "failed");
  b.resolve(p.result);
  const result = await pending;
  assert.equal(result.reason, "error_threshold");
  assert.deepEqual(
    result.snapshot.graph.nodes.map((n) => n.status),
    ["failed", "completed"],
  );
  assert.equal(
    p.events.at(-1)?.message,
    "execute scheduler paused after 1 consecutive node error(s).",
  );
  assert.deepEqual(p.events.at(-1)?.payload, { consecutiveErrors: 1 });

  const reset = ports(snapshot([node("a"), node("b")]));
  const first = gate<typeof reset.result>(),
    second = gate<typeof reset.result>(),
    success = gate<typeof reset.result>(),
    ready = gate<void>(),
    retry = gate<void>();
  let calls = 0;
  reset.hooks.run = (input) => {
    if (input.node.id === "b") {
      ready.resolve();
      return success.promise;
    }
    if (++calls === 1) return first.promise;
    assert.equal(input.node.attempts, 1);
    retry.resolve();
    return second.promise;
  };
  const finished = new current.WorkflowGraphScheduler(reset.deps).run(reset.options);
  await ready.promise;
  first.reject(new Error("Owned first failure"));
  await retry.promise;
  success.resolve(reset.result);
  await flush();
  second.reject(new Error("Owned second failure"));
  const stopped = await finished;
  assert.equal(stopped.reason, "deadlock", "successful observed outcome resets consecutive errors");
  assert.equal(stopped.snapshot.graph.nodes[0]?.attempts, 2);
  assert.deepEqual(
    reset.requests.map((r) => r.node.id),
    ["a", "b", "a"],
  );
});

test(`${surface}: actual collection boundary expands executable scope before dispatch`, async () => {
  const initial = snapshot([]);
  initial.graph.collections = [
    { collectionId: "owned-collection", explorable: true, phase: "execute", nodeIds: [] },
  ];
  const p = ports(initial);
  p.options.executableNodeIds = [];
  p.hooks.planner = (input) => {
    assert.equal(input.snapshot.graph, input.graph);
    assert.equal(input.abortSignal, p.controller.signal);
    assert.equal(input.collection.collectionId, "owned-collection");
    return Promise.resolve({
      nodes: [
        { id: "added", title: "Owned added node", dependsOn: [], kind: "task", phase: "execute" },
      ],
      edges: [],
      exhausted: true,
      response: "Owned planner response",
      sessionId: "owned-planner",
    });
  };
  const result = await new current.WorkflowGraphScheduler(p.deps).run(p.options);
  assert.equal(result.reason, "completed");
  assert.equal(p.plannerRequests.length, 1);
  assert.deepEqual(
    p.requests.map((r) => r.node.id),
    ["added"],
  );
  assert.deepEqual(
    result.snapshot.graph.nodes.map((n) => [n.id, n.status]),
    [["added", "completed"]],
  );
  assert.deepEqual(
    p.events.slice(0, 5).map((e) => e.type),
    [
      "planner_started",
      "planner_completed",
      "graph_expanded",
      "collection_exhausted",
      "frontier_changed",
    ],
  );
  assert.deepEqual(p.events[4]?.payload, {
    activeNodeIds: [],
    blockedNodes: [],
    readyNodeIds: ["added"],
  });
  assert.equal(initial.graph.nodes.length, 0);
});

test(`${surface}: invocation isolation, frontier failure and abort leave exact partial lifetimes`, async () => {
  const p = ports(snapshot([node("a")], "one")),
    entered = gate<void>(),
    secondEntered = gate<void>();
  const one = gate<typeof p.result>(),
    two = gate<typeof p.result>();
  let callbackIndex = 0;
  p.deps.onWorkflowEvent = (event) => {
    assert.equal(event, p.events[callbackIndex++]);
    p.trace.push(`callback:${event.type}:${event.nodeId ?? ""}`);
  };
  p.hooks.run = (input) => {
    if (input.runId === "one") {
      entered.resolve();
      return one.promise;
    }
    secondEntered.resolve();
    return two.promise;
  };
  const scheduler = new current.WorkflowGraphScheduler(p.deps);
  const a = scheduler.run(p.options),
    b = scheduler.run({ ...p.options, snapshot: snapshot([node("a")], "two") });
  await Promise.all([entered.promise, secondEntered.promise]);
  assert.deepEqual(
    p.events.slice(0, 2).map((event) => event.runId),
    ["one", "two"],
  );
  assert.deepEqual(p.trace.filter((entry) => /^(event|callback):/u.test(entry)).slice(0, 4), [
    "event:frontier_changed:",
    "event:frontier_changed:",
    "callback:frontier_changed:",
    "callback:frontier_changed:",
  ]);
  one.resolve(p.result);
  const first = await a;
  assert.equal(first.snapshot.runId, "one");
  assert.equal(p.writes.filter((s) => s.runId === "two").at(-1)?.graph.nodes[0]?.status, "active");
  two.resolve(p.result);
  assert.equal((await b).snapshot.runId, "two");
  assert.equal(callbackIndex, p.events.length);

  const rejected = ports(snapshot([])),
    error = new Error("Owned frontier rejection");
  rejected.hooks.event = () => Promise.reject(error);
  await assert.rejects(
    new current.WorkflowGraphScheduler(rejected.deps).run(rejected.options),
    (e) => e === error,
  );
  assert.deepEqual(
    rejected.events.map((e) => e.type),
    ["frontier_changed"],
  );
  assert.equal(rejected.writes.length, 0);
  assert.equal(
    rejected.trace.some((t) => t.startsWith("callback:")),
    false,
  );

  const cancelled = ports(snapshot([node("a")])),
    started = gate<void>(),
    late = gate<void>(),
    hold = gate<typeof cancelled.result>(),
    reason = new Error("Owned pending abort");
  cancelled.hooks.run = () => {
    started.resolve();
    return hold.promise;
  };
  cancelled.hooks.event = (event) => {
    if (event.type === "node_completed") late.resolve();
    return Promise.resolve();
  };
  const run = new current.WorkflowGraphScheduler(cancelled.deps).run(cancelled.options);
  let settled = false;
  const rejection = assert
    .rejects(run, (e) => e === reason)
    .then(() => {
      settled = true;
    });
  await started.promise;
  await flush();
  cancelled.controller.abort(reason);
  await flush();
  assert.equal(settled, false);
  assert.equal(cancelled.writes.at(-1)?.graph.nodes[0]?.status, "active");
  hold.resolve(cancelled.result);
  await rejection;
  await late.promise;
  await flush();
  assert.equal(cancelled.writes.at(-1)?.graph.nodes[0]?.status, "completed");
  assert.equal(
    cancelled.events.some((e) => e.type === "executor_completed"),
    false,
  );
});
