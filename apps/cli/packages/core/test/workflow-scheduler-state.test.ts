import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { WorkflowGraph } from "@knorvia/contracts";
import {
  actual,
  current,
  historical,
  scheduler,
  historicalScheduler,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-scheduler-state-fixture.js";
import { node, ports, snapshot } from "./workflow-scheduler-observation-ports.js";
type Derive = typeof current.deriveWorkflowSchedulerState;
function paired(probe: (derive: Derive) => unknown) {
  assert.deepEqual(
    probe(current.deriveWorkflowSchedulerState),
    probe(historical.deriveWorkflowSchedulerState),
  );
}
function observe(derive: Derive, graph: WorkflowGraph) {
  const before = JSON.stringify(graph),
    state = derive(graph);
  assert.equal(JSON.stringify(graph), before);
  state.nodes.forEach((entry, i) => assert.equal(entry.node, graph.nodes[i]));
  state.collectionStates.forEach((entry, i) =>
    assert.equal(entry.collection, graph.collections![i]),
  );
  assert.deepEqual(Object.keys(state), [
    "activeActivities",
    "activeChildSessionIds",
    "activeNodeIds",
    "blockedNodes",
    "counts",
    "collectionStates",
    "nodes",
    "readyNodeIds",
  ]);
  assert.deepEqual(Object.keys(state.counts), [
    "active",
    "blocked",
    "completed",
    "failed",
    "pending",
    "ready",
    "total",
  ]);
  state.nodes.forEach((entry) =>
    assert.deepEqual(Object.keys(entry), [
      "blockedBy",
      "collectionIds",
      "incoming",
      "node",
      "outgoing",
      "ready",
    ]),
  );
  state.collectionStates.forEach((entry) =>
    assert.deepEqual(Object.keys(entry), [
      "activeNodeIds",
      "collection",
      "completedNodeIds",
      "errorCount",
      "exhausted",
      "failedNodeIds",
      "frontier",
      "frontierTarget",
      "pendingNodeIds",
      "plannerRuns",
      "readyNodeIds",
      "status",
    ]),
  );
  return state;
}
test(`${surface}: scheduler projection dependency order and occurrence counts`, () => {
  paired((derive) => {
    const graph = snapshot([
      node("a", { dependsOn: ["ok", "missing", "ok"] }),
      node("ok", { status: "failed" }),
      node("run", { status: "active" }),
      node("skip", { status: "skipped" }),
      node("cancel", { status: "cancelled" }),
      node("done", { status: "completed" }),
      node("z", { dependsOn: ["skip", "cancel", "done", "ok"] }),
    ]).graph;
    graph.edges = [
      { from: "missing2", to: "a" },
      { from: "ok", to: "a" },
      { from: "a", to: "ghost" },
      { from: "a", to: "ghost" },
    ];
    const out = observe(derive, graph);
    assert.deepEqual(out.nodes[0]!.incoming, ["ok", "missing", "missing2"]);
    assert.deepEqual(out.nodes[0]!.blockedBy, ["missing", "missing2"]);
    assert.deepEqual(out.nodes[0]!.outgoing, ["ghost"]);
    assert.deepEqual(out.nodes[1]!.outgoing, ["a"]);
    assert.equal(out.blockedNodes[0]!.blockedBy, out.nodes[0]!.blockedBy);
    assert.deepEqual(out.readyNodeIds, ["z"]);
    assert.deepEqual(out.counts, {
      active: 1,
      blocked: 1,
      completed: 1,
      failed: 1,
      pending: 2,
      ready: 1,
      total: 7,
    });
    return { out, serialized: JSON.stringify(out) };
  });
});
test(`${surface}: scheduler projection duplicate IDs, memberships and collection defaults`, () => {
  paired((derive) => {
    const graph = snapshot([
      node("x", { dependsOn: ["missing-old"], collectionId: "inferred" }),
      node("y", { status: "failed" }),
      node("x", { status: "active", dependsOn: ["y"], collectionId: "inferred2" }),
      node("", { collectionId: "" }),
    ]).graph;
    graph.collections = [
      { collectionId: "C", nodeIds: ["x", "x", "unknown"] },
      {
        collectionId: "C",
        nodeIds: ["x"],
        errorCount: 2,
        status: "exhausted",
        exhausted: false,
        plannerRuns: 3,
        frontierTarget: 4,
      },
      { collectionId: "" },
    ];
    const out = observe(derive, graph);
    assert.deepEqual(out.nodes[0]!.incoming, ["y"]);
    assert.notEqual(out.nodes[0]!.incoming, out.nodes[2]!.incoming);
    assert.deepEqual(out.nodes[0]!.collectionIds, ["C", "C", "C", "inferred", "inferred2"]);
    assert.equal(out.nodes[0]!.collectionIds, out.nodes[2]!.collectionIds);
    assert.deepEqual(out.nodes[3]!.collectionIds, []);
    assert.deepEqual(out.activeNodeIds, ["x"]);
    assert.deepEqual(out.readyNodeIds, ["x", ""]);
    assert.deepEqual(out.collectionStates[0]!.activeNodeIds, ["x"]);
    assert.deepEqual(out.collectionStates[0]!.pendingNodeIds, []);
    assert.equal(out.collectionStates[0]!.frontier, 1);
    assert.equal(out.collectionStates[0]!.frontierTarget, undefined);
    assert.equal(out.collectionStates[0]!.status, "active");
    assert.equal(out.collectionStates[0]!.errorCount, 0);
    assert.equal(out.collectionStates[1]!.status, "exhausted");
    assert.equal(out.collectionStates[1]!.exhausted, false);
    assert.deepEqual(out.collectionStates[2]!.pendingNodeIds, [""]);
    assert.deepEqual(out.collectionStates[2]!.readyNodeIds, [""]);
    return { out, serialized: JSON.stringify(out) };
  });
});
test(`${surface}: scheduler projection stable collection lists and per-call state`, () => {
  paired((derive) => {
    const graph = snapshot([
      node("a", { collectionId: "K" }),
      node("b", { collectionId: "K", status: "active" }),
      node("c", { collectionId: "K", status: "completed" }),
      node("d", { collectionId: "K", status: "failed" }),
      node("u"),
      node("u"),
    ]).graph;
    graph.collections = [{ collectionId: "K", nodeIds: ["c", "a", "ghost", "a"] }];
    const out = observe(derive, graph),
      again = observe(derive, graph);
    assert.deepEqual(out.collectionStates[0]!.activeNodeIds, ["b"]);
    assert.deepEqual(out.collectionStates[0]!.completedNodeIds, ["c"]);
    assert.deepEqual(out.collectionStates[0]!.pendingNodeIds, ["a"]);
    assert.deepEqual(out.collectionStates[0]!.failedNodeIds, ["d"]);
    assert.deepEqual(out.collectionStates[0]!.readyNodeIds, ["a"]);
    assert.equal(out.collectionStates[0]!.frontier, 2);
    assert.deepEqual(out.readyNodeIds, ["a", "u", "u"]);
    assert.notEqual(out.nodes[4]!.collectionIds, out.nodes[5]!.collectionIds);
    assert.deepEqual(out, again);
    assert.notEqual(out, again);
    assert.notEqual(out.nodes[0]!.incoming, again.nodes[0]!.incoming);
    assert.notEqual(out.activeActivities, out.activeChildSessionIds);
    const empty = observe(derive, { nodes: [], edges: [] });
    assert.deepEqual(empty.counts, {
      active: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      ready: 0,
      total: 0,
    });
    return { out, empty };
  });
});
async function consume(implementation: typeof scheduler) {
  const initial = snapshot([
    node("done", { status: "completed" }),
    node("ready", { dependsOn: ["done"] }),
    node("blocked", { dependsOn: ["unknown"] }),
  ]);
  const p = ports(initial);
  p.deps.plannerRunner = undefined;
  const out = await new implementation.WorkflowGraphScheduler(p.deps).run(p.options);
  assert.equal(out.reason, "deadlock");
  assert.deepEqual(
    p.requests.map((r) => r.node.id),
    ["ready"],
  );
  assert.equal(p.events[0]!.type, "frontier_changed");
  assert.deepEqual(p.events[0]!.payload, {
    activeNodeIds: [],
    blockedNodes: [{ blockedBy: ["unknown"], nodeId: "blocked" }],
    readyNodeIds: ["ready"],
  });
  return { out, trace: p.trace, events: p.events, writes: p.writes };
}
test(`${surface}: scheduler projection actual ready/blocked and scheduler consumer`, async () => {
  assert.deepEqual(await consume(scheduler), await consume(historicalScheduler));
});
test(`${surface}: scheduler projection exact artifacts and historical closure fail closed`, async () => {
  assert.equal(current.deriveWorkflowSchedulerState, actual.deriveWorkflowSchedulerState);
  assert.notEqual(current.deriveWorkflowSchedulerState, historical.deriveWorkflowSchedulerState);
  const missing = new Error("Owned missing projection artifact");
  await assert.rejects(loadHistorical(async () => "wrong"));
  await assert.rejects(
    loadHistorical(async () => {
      throw missing;
    }),
    (e) => e === missing,
  );
  for (const suffix of [
    "contracts/src/workflow/index.ts",
    "contracts/dist/workflow/index.js",
    "contracts/dist/workflow/index.d.ts",
    "core/dist/workflow/scheduler/graph.js",
    "core/dist/workflow/scheduler.js",
  ]) {
    await assert.rejects(
      loadCurrent((url) =>
        url.pathname.endsWith(suffix) ? Promise.resolve("wrong") : readFile(url, "utf8"),
      ),
    );
    await assert.rejects(
      loadCurrent((url) => {
        if (url.pathname.endsWith(suffix)) throw missing;
        return readFile(url, "utf8");
      }),
      (e) => e === missing,
    );
  }
});
