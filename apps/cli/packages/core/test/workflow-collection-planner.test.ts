import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { WorkflowCollectionPlannerRuntime } from "../src/workflow/scheduler/collection-runtime.js";
import type { WorkflowGraphSchedulerPlannerRunResult } from "../src/workflow/scheduler/types.js";
import {
  actual,
  archive,
  consumer,
  current,
  events,
  historical,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-collection-planner-fixture.js";
import { gate, node, ports, snapshot } from "./workflow-scheduler-observation-ports.js";

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function owned() {
  const initial = snapshot([]);
  initial.graph.collections = [
    { collectionId: "owned-collection", explorable: true, phase: "execute", nodeIds: [] },
  ];
  const p = ports(initial);
  p.options.parentSessionId = "owned-parent";
  const runtime: WorkflowCollectionPlannerRuntime = {
    createActivityId: p.deps.createActivityId,
    eventLog: new events.WorkflowSchedulerEventLog(p.deps),
    plannerRunner: p.deps.plannerRunner,
    writeArtifact: p.deps.writeArtifact,
    writeSnapshot: p.deps.writeSnapshot,
  };
  const write = runtime.writeSnapshot;
  runtime.writeSnapshot = function (value, settings) {
    assert.equal(this, runtime);
    return write(value, settings);
  };
  return { ...p, runtime };
}
type Owned = ReturnType<typeof owned>;
type Check = typeof current.checkCollectionPlanners;
const run = (check: Check, p: Owned) =>
  check(
    p.options.snapshot,
    new Set(p.options.snapshot.graph.nodes.map((n) => n.id)),
    p.options,
    p.runtime,
  );
const view = (p: Owned, result: unknown) => ({
  result,
  trace: p.trace,
  writes: p.writes,
  events: p.events,
  serializedWrites: p.writes.map((value) => JSON.stringify(value)),
  activityKeys: p.writes.map((value) => value.activities.map((activity) => Object.keys(activity))),
});
async function paired(probe: (check: Check) => Promise<unknown>) {
  assert.deepEqual(
    await probe(current.checkCollectionPlanners),
    await probe(historical.checkCollectionPlanners),
  );
}

test(`${surface}: admission bypass and planner-limit priority`, async () => {
  await paired(async (check) => {
    const empty = owned();
    empty.runtime.plannerRunner = undefined;
    empty.controller.abort(new Error("Owned bypass abort"));
    const bypass = await run(check, empty);
    assert.equal(bypass.snapshot, empty.options.snapshot);
    assert.deepEqual(bypass.addedNodeIds, []);
    assert.equal(bypass.plannersRan, 0);
    assert.deepEqual(empty.trace, []);

    const limited = owned();
    limited.options.snapshot.graph.collections![0]!.plannerRuns = 2;
    limited.options.snapshot.graph.collections![0]!.errorCount = 2;
    const result = await run(check, limited);
    assert.equal(result.plannersRan, 0);
    assert.equal(limited.plannerRequests.length, 0);
    assert.equal(limited.events[0]?.type, "collection_exhausted");
    assert.deepEqual(limited.events[0]?.payload, {
      collectionId: "owned-collection",
      reason: "max_planner_runs",
    });
    assert.equal(result.snapshot.graph.collections?.[0]?.status, "exhausted");

    const deferred = owned();
    deferred.options.snapshot.graph.nodes = [
      node("owned-seed", { collectionId: "owned-collection" }),
    ];
    deferred.options.snapshot.strategy.executor.frontierTarget = 2;
    const active = await run(check, deferred);
    assert.equal(active.snapshot.graph.collections?.[0]?.status, "active");
    assert.equal(active.plannersRan, 0);
    assert.equal(deferred.writes.length, 0);
    assert.deepEqual(deferred.trace, ["clock:0"]);
    return [view(empty, bypass), view(limited, result), view(deferred, active)];
  });
});

test(`${surface}: activation/child gates and successful publication identity`, async () => {
  await paired(async (check) => {
    const p = owned(),
      activeWrite = gate<void>(),
      childWrite = gate<void>(),
      entered = gate<void>();
    let writes = 0;
    p.hooks.write = () =>
      ++writes === 1 ? activeWrite.promise : writes === 2 ? childWrite.promise : Promise.resolve();
    p.hooks.planner = async (input) => {
      entered.resolve();
      assert.equal(input.graph, input.snapshot.graph);
      assert.equal(input.snapshot, p.writes[0]);
      assert.deepEqual(input.collection, input.snapshot.graph.collections?.[0]);
      assert.equal(input.parentSessionId, "owned-parent");
      assert.equal(input.abortSignal, p.controller.signal);
      await input.onChildSessionStarted!({
        sessionId: "owned-linked",
        model: "owned-linked-model",
        traceId: "owned-linked-trace",
        turnId: "owned-linked-turn",
      });
      // Keep the frozen partial node response; expansion supplies its schema defaults.
      return {
        response: "Owned planner success",
        sessionId: "owned-final",
        model: "owned-final-model",
        turnId: "owned-final-turn",
        nodes: [{ id: "owned-added", title: "Owned added" }],
        edges: [],
        exhausted: true,
      } as unknown as WorkflowGraphSchedulerPlannerRunResult;
    };
    const pending = run(check, p);
    await flush();
    assert.equal(p.plannerRequests.length, 0);
    activeWrite.resolve();
    await entered.promise;
    await flush();
    assert.equal(p.writes[1]?.activities[0]?.sessionId, "owned-linked");
    assert.deepEqual(
      p.events.map((e) => e.type),
      ["planner_started"],
    );
    childWrite.resolve();
    const result = await pending;
    assert.equal(result.snapshot, p.writes.at(-1));
    assert.deepEqual(result.addedNodeIds, ["owned-added"]);
    assert.equal(result.plannersRan, 1);
    assert.equal(result.snapshot.activities[0]?.sessionId, "owned-final");
    assert.equal(result.snapshot.activities[0]?.model, "owned-final-model");
    assert.equal(result.snapshot.activities[0]?.traceId, undefined);
    assert.equal(result.snapshot.activities[0]?.turnId, "owned-final-turn");
    assert.deepEqual(
      p.events.map((e) => e.type),
      [
        "planner_started",
        "workflow_session_linked",
        "planner_completed",
        "graph_expanded",
        "collection_exhausted",
      ],
    );
    assert.equal(p.options.snapshot.activities.length, 0);
    assert.equal(p.options.snapshot.graph.nodes.length, 0);
    return view(p, result);
  });
});

test(`${surface}: runner failure retains linked identity and threshold exhaustion`, async () => {
  await paired(async (check) => {
    const p = owned();
    p.options.snapshot.strategy.executor.maxConsecutiveErrors = 1;
    p.hooks.planner = async (input) => {
      await input.onChildSessionStarted!({
        sessionId: "owned-linked",
        model: "owned-model",
        traceId: "owned-trace",
        turnId: "owned-turn",
      });
      throw new Error("Owned planner rejection");
    };
    const result = await run(check, p),
      activity = result.snapshot.activities[0];
    assert.equal(activity?.sessionId, "owned-linked");
    assert.equal(activity?.model, "owned-model");
    assert.equal(activity?.traceId, "owned-trace");
    assert.equal(activity?.turnId, "owned-turn");
    assert.equal(activity?.status, "failed");
    assert.equal(activity?.error, "Owned planner rejection");
    assert.equal(result.snapshot.graph.collections?.[0]?.errorCount, 1);
    assert.equal(result.snapshot.graph.collections?.[0]?.exhausted, true);
    assert.deepEqual(result.addedNodeIds, []);
    assert.deepEqual(
      p.events.map((e) => e.type),
      ["planner_started", "workflow_session_linked", "planner_failed", "collection_exhausted"],
    );
    return view(p, result);
  });
});

test(`${surface}: activation failure and execution abort propagate exact errors`, async () => {
  await paired(async (check) => {
    const active = owned(),
      activeError = new Error("Owned active write error");
    active.hooks.write = () => Promise.reject(activeError);
    await assert.rejects(run(check, active), (e) => e === activeError);
    assert.equal(active.writes.length, 1);
    assert.equal(active.plannerRequests.length, 0);
    assert.deepEqual(active.events, []);

    const cancelled = owned(),
      runnerError = new Error("Owned runner error"),
      abortReason = new Error("Owned distinct abort");
    cancelled.hooks.planner = () => {
      cancelled.controller.abort(abortReason);
      return Promise.reject(runnerError);
    };
    await assert.rejects(run(check, cancelled), (e) => e === runnerError);
    assert.equal(cancelled.writes.length, 1);
    assert.deepEqual(
      cancelled.events.map((e) => e.type),
      ["planner_started"],
    );
    return [view(active, undefined), view(cancelled, undefined)];
  });
});

test(`${surface}: terminal projection rollback and retained late-child cursor`, async () => {
  await paired(async (check) => {
    const failed = owned();
    failed.hooks.event = (event) =>
      event.type === "planner_completed"
        ? Promise.reject(new Error("Owned terminal publication error"))
        : Promise.resolve();
    const failure = await run(check, failed);
    assert.equal(failed.writes[1]?.activities[0]?.status, "completed");
    assert.equal(failure.snapshot.activities[0]?.status, "failed");
    assert.equal(failure.snapshot.activities[0]?.error, "Owned terminal publication error");
    assert.equal(failure.snapshot.artifacts.length, 0);
    assert.deepEqual(
      failed.events.map((e) => e.type),
      ["planner_started", "planner_completed", "planner_failed"],
    );
    assert.equal(failed.trace.filter((t) => t.startsWith("artifact:")).length, 1);

    const late = owned();
    const completed = await run(check, late);
    const published = completed.snapshot;
    assert.equal(published.activities[0]?.status, "completed");
    assert.equal(
      late.events.some((e) => e.type === "graph_expanded"),
      false,
    );
    await late.plannerRequests[0]!.onChildSessionStarted!({
      sessionId: "owned-late",
      model: "owned-late-model",
    });
    assert.equal(completed.snapshot, published);
    assert.equal(completed.snapshot.activities[0]?.sessionId, "owned-planner");
    assert.equal(late.writes.at(-1)?.activities[0]?.status, "active");
    assert.equal(late.writes.at(-1)?.activities[0]?.sessionId, "owned-late");
    assert.deepEqual(
      late.events.map((e) => e.type),
      ["planner_started", "planner_completed", "collection_exhausted", "workflow_session_linked"],
    );
    return [view(failed, failure), view(late, completed)];
  });
});

test(`${surface}: preserved actual scheduler expansion consumer`, async () => {
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
  const result = await new consumer.WorkflowGraphScheduler(p.deps).run(p.options);
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

test(`${surface}: runner-visible collection mutation leaves original artifact identity/count`, async () => {
  const probe = async (check: Check) => {
    const p = owned();
    p.hooks.planner = (input) => {
      input.collection.collectionId = "owned-mutated";
      input.collection.plannerRuns = 99;
      return Promise.resolve({
        response: "Owned mutation response",
        sessionId: "owned-final",
        nodes: [],
        edges: [],
        exhausted: true,
      });
    };
    const result = await run(check, p);
    assert.equal(
      result.snapshot.artifacts[0]?.path,
      "artifacts/exec/planners/owned-collection-1.md",
    );
    assert.equal(result.snapshot.artifacts[0]?.label, "Planner owned-collection");
    return view(p, result);
  };
  const expected = await probe(historical.checkCollectionPlanners);
  assert.deepEqual(await probe(current.checkCollectionPlanners), expected);
});

test(`${surface}: exact historical and current owner selection fail closed`, async () => {
  assert.equal(current.checkCollectionPlanners, actual.checkCollectionPlanners);
  assert.notEqual(current.checkCollectionPlanners, historical.checkCollectionPlanners);
  assert.equal(
    archive.sourceSha256,
    "328f5fa6b3136e9c77589a638a91fc6e212fa443318b6e59e4010af2d697e797",
  );
  await assert.rejects(loadHistorical(async () => "wrong archive"));
  const missing = new Error("Owned missing artifact");
  await assert.rejects(
    loadHistorical(async () => {
      throw missing;
    }),
    (e) => e === missing,
  );
  for (const path of [
    "src/workflow/scheduler/collection-planner.ts",
    "dist/workflow/scheduler/collection-planner.js",
    "dist/workflow/scheduler/collection-planner.d.ts",
    "src/workflow/scheduler/collection-planner-admission.ts",
    "dist/workflow/scheduler/collection-planner-admission.js",
    "dist/workflow/scheduler/collection-planner-admission.d.ts",
  ]) {
    await assert.rejects(
      loadCurrent((url) =>
        url.pathname.endsWith(path) ? Promise.resolve("wrong artifact") : readFile(url, "utf8"),
      ),
    );
    await assert.rejects(
      loadCurrent((url) => {
        if (url.pathname.endsWith(path)) throw missing;
        return readFile(url, "utf8");
      }),
      (e) => e === missing,
    );
  }
});
