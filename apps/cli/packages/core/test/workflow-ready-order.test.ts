import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { setImmediate as settleTurn } from "node:timers/promises";
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
} from "./workflow-ready-order-fixture.js";
import { gate, node, ports, snapshot } from "./workflow-scheduler-observation-ports.js";

type Order = typeof current.orderedReadyExecutableNodes;
function unequal() {
  const graph = snapshot(
    ["a1", "e", "b1", "c1", "d1", "a2", "b2", "d2"].map((id) => node(id)),
  ).graph;
  graph.collections = [
    { collectionId: "A", explorable: true, nodeIds: ["a2", "a1"] },
    { collectionId: "B", explorable: true, nodeIds: ["b1", "b2"] },
    { collectionId: "C", explorable: true, nodeIds: ["c1"] },
    { collectionId: "D", explorable: true, nodeIds: ["d1", "d2"] },
  ];
  return graph;
}
function observe(order: Order, graph: WorkflowGraph, ids = graph.nodes.map((n) => n.id)) {
  const before = JSON.stringify(graph),
    selected = new Set(ids);
  const result = order(graph, selected);
  assert.equal(JSON.stringify(graph), before);
  for (const item of result)
    assert.equal(
      item,
      graph.nodes.find((n) => n.id === item.id),
    );
  const repeated = order(graph, selected);
  assert.notEqual(repeated, result);
  assert.deepEqual(repeated, result);
  assert.deepEqual([...selected], ids);
  return result.map((n) => n.id);
}
function paired(probe: (order: Order) => unknown) {
  assert.deepEqual(
    probe(current.orderedReadyExecutableNodes),
    probe(historical.orderedReadyExecutableNodes),
  );
}

test(`${surface}: ready order unequal buckets retain shrinking-rank sequence`, () => {
  paired((order) => {
    const ids = observe(order, unequal());
    assert.deepEqual(ids, ["e", "a1", "b1", "c1", "d1", "a2", "d2", "b2"]);
    return ids;
  });
});

test(`${surface}: ready order repeated collection contributions, overlap and eligibility`, () => {
  paired((order) => {
    const graph = snapshot([
      node("u"),
      node("v"),
      node("w", { collectionId: "X" }),
      node("e"),
      node("t"),
      node("blocked", { dependsOn: ["missing"] }),
      node("busy", { status: "active" }),
      node("not-selected"),
    ]).graph;
    graph.collections = [
      { collectionId: "empty", explorable: true, nodeIds: ["missing"] },
      { collectionId: "X", explorable: true, nodeIds: ["v", "u", "u"] },
      { collectionId: "Y", explorable: true, nodeIds: ["v", "w"] },
      { collectionId: "X", explorable: true, nodeIds: ["w"] },
      { collectionId: "ignored", explorable: true, exhausted: true, nodeIds: ["e"] },
      { collectionId: "defaults", nodeIds: ["e"] },
      { collectionId: "Z", explorable: true, status: "exhausted", nodeIds: ["t"] },
    ];
    const ids = observe(order, graph, ["u", "v", "w", "e", "t", "blocked", "busy"]);
    assert.deepEqual(ids, ["e", "u", "v", "t", "v", "w", "w", "w"]);
    return ids;
  });
});

test(`${surface}: ready order empty, absent collections and executable readiness`, () => {
  paired((order) => {
    const graph = snapshot([
      node("p"),
      node("done", { status: "completed" }),
      node("q", { dependsOn: ["done"] }),
      node("blocked", { dependsOn: ["unknown"] }),
    ]).graph;
    delete graph.collections;
    assert.deepEqual(observe(order, graph), ["p", "q"]);
    assert.deepEqual(observe(order, graph, ["q"]), ["q"]);
    assert.deepEqual(observe(order, graph, []), []);
    assert.deepEqual(observe(order, snapshot([]).graph), []);
    return observe(order, graph);
  });
});

async function launches(implementation: typeof scheduler, cap: number) {
  const graph = unequal(),
    initial = snapshot(graph.nodes);
  initial.graph = graph;
  initial.strategy.executor.maxConcurrentLoops = cap;
  const p = ports(initial);
  p.deps.plannerRunner = undefined;
  const entered = Array.from({ length: graph.nodes.length }, () => gate<void>());
  const finishes = Array.from({ length: graph.nodes.length }, () => gate<typeof p.result>());
  const published = Array.from({ length: graph.nodes.length }, () => gate<void>());
  const after = p.deps.onWorkflowEvent!;
  p.deps.onWorkflowEvent = function (event) {
    after.call(this, event);
    if (event.type === "artifact_written") {
      const index = p.requests.findIndex((request) => request.node.id === event.nodeId);
      published[index]!.resolve();
    }
  };
  p.hooks.run = (input) => {
    const index = p.requests.length - 1;
    assert.equal(
      input.node,
      graph.nodes.find((n) => n.id === input.node.id),
    );
    entered[index]!.resolve();
    return finishes[index]!.promise;
  };
  const running = new implementation.WorkflowGraphScheduler(p.deps).run(p.options);
  await entered[Math.min(cap, graph.nodes.length) - 1]!.promise;
  await settleTurn();
  const first = p.requests.map((r) => r.node.id);
  assert.equal(first.length, Math.min(cap, graph.nodes.length));
  for (let i = 0; i < graph.nodes.length; i++) {
    await entered[i]!.promise;
    finishes[i]!.resolve(p.result);
    // Reused port assertion observes one terminal publication at a time.
    await published[i]!.promise;
    await settleTurn();
  }
  const out = await running;
  assert.equal(out.reason, "completed");
  assert.equal(p.plannerRequests.length, 0);
  assert.deepEqual(
    initial.graph.nodes.map((n) => n.status),
    Array(graph.nodes.length).fill("pending"),
  );
  return {
    first,
    launches: p.requests.map((r) => r.node.id),
    out,
    trace: p.trace,
    events: p.events,
  };
}
test(`${surface}: ready order actual scheduler launch list and concurrent cap`, async () => {
  for (const cap of [8, 2]) {
    const expected = await launches(historicalScheduler, cap);
    if (cap === 8)
      assert.deepEqual(expected.first, ["e", "a1", "b1", "c1", "d1", "a2", "d2", "b2"]);
    else assert.deepEqual(expected.first, ["e", "a1"]);
    assert.deepEqual(await launches(scheduler, cap), expected);
  }
});

test(`${surface}: ready order historical/current graph and consumer selectors fail closed`, async () => {
  assert.equal(current.orderedReadyExecutableNodes, actual.orderedReadyExecutableNodes);
  assert.notEqual(current.orderedReadyExecutableNodes, historical.orderedReadyExecutableNodes);
  assert.notEqual(scheduler.WorkflowGraphScheduler, historicalScheduler.WorkflowGraphScheduler);
  const missing = new Error("Owned missing ordering artifact");
  await assert.rejects(loadHistorical(async () => "wrong"));
  await assert.rejects(
    loadHistorical(async () => {
      throw missing;
    }),
    (e) => e === missing,
  );
  for (const suffix of [
    "src/workflow/scheduler/graph.ts",
    "dist/workflow/scheduler/graph.js",
    "dist/workflow/scheduler/graph.d.ts",
    "src/workflow/scheduler.ts",
    "dist/workflow/scheduler.js",
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
