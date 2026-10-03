import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type {
  SchedulerCollection,
  WorkflowGraphSchedulerPlannerRunResult,
} from "../src/workflow/scheduler/types.js";
import {
  actual,
  current,
  historical,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-planner-expansion-fixture.js";
import { node, snapshot } from "./workflow-scheduler-observation-ports.js";

type Apply = typeof current.applyPlannerExpansion;
const result = (fields: unknown) => fields as WorkflowGraphSchedulerPlannerRunResult;
const collection = (fields: Partial<SchedulerCollection> = {}): SchedulerCollection => ({
  collectionId: "owned",
  analyzedNodeIds: [],
  errorCount: 0,
  exhausted: false,
  explorable: true,
  nodeIds: [],
  plannerRuns: 1,
  status: "active",
  ...fields,
});
function paired(probe: (apply: Apply) => unknown) {
  assert.deepEqual(probe(current.applyPlannerExpansion), probe(historical.applyPlannerExpansion));
}
const view = (value: ReturnType<Apply>) => ({
  value,
  serialized: JSON.stringify(value),
  nodeKeys: value.addedNodes.map(Object.keys),
  edgeKeys: value.addedEdges.map(Object.keys),
  collectionKeys: Object.keys(value.collection),
  graphKeys: Object.keys(value.snapshot.graph),
});

test(`${surface}: expansion projection, ordering and shared references`, () => {
  paired((apply) => {
    const seed = snapshot([node("a", { collectionId: "owned", status: "completed" }), node("b")]);
    const first = { from: "a", to: "b" };
    seed.graph.edges = [first];
    const c = collection({ nodeIds: ["listed", "a", "listed"], analyzedNodeIds: ["seen"] });
    const other = collection({ collectionId: "other" });
    seed.graph.collections = [c, other, c];
    const raw = {
      nodes: [
        { id: "c", title: "C", dependsOn: ["b", "a", "b"] },
        {
          id: "d",
          title: "D",
          collectionId: "other",
          dependsOn: ["c"],
          kind: "phase",
          prompt: "Owned prompt",
          extra: "strip",
        },
      ],
      edges: [{ from: "a", to: "c", extra: "strip" }],
      collectionNodeIds: ["d", "external", "a"],
      reasoning: "Owned reason",
    };
    const before = JSON.stringify({ seed, c, raw });
    const out = apply(seed, c, result(raw), ["seen", "done", "done"], "owned-time");
    assert.equal(JSON.stringify({ seed, c, raw }), before);
    assert.deepEqual(out.addedEdges, [
      { from: "a", to: "c" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
    ]);
    assert.deepEqual(out.collection.nodeIds, ["listed", "a", "d", "external"]);
    assert.deepEqual(out.collection.analyzedNodeIds, ["seen", "done"]);
    assert.equal(out.collection.lastGraphChangeAt, "owned-time");
    assert.equal(out.collection.status, "active");
    assert.equal(out.snapshot.graph.nodes[0], seed.graph.nodes[0]);
    assert.equal(out.snapshot.graph.edges[0], first);
    assert.equal(out.snapshot.graph.nodes[2], out.addedNodes[0]);
    assert.equal(out.snapshot.graph.edges[1], out.addedEdges[0]);
    assert.equal(out.snapshot.graph.collections![0], out.collection);
    assert.equal(out.snapshot.graph.collections![2], out.collection);
    assert.notEqual(out.snapshot.graph.collections![1], other);
    assert.equal(out.snapshot.graph.collections![1]!.nodeIds, other.nodeIds);
    assert.equal(out.snapshot.activities, seed.activities);
    assert.notEqual(out.addedNodes[0]!.dependsOn, raw.nodes[0]!.dependsOn);
    assert.notEqual(out.addedEdges[0], raw.edges[0]);
    assert.deepEqual(Object.keys(out.addedNodes[0]!), [
      "collectionId",
      "dependsOn",
      "description",
      "id",
      "kind",
      "phase",
      "prompt",
      "status",
      "title",
    ]);
    assert.deepEqual(Object.keys(out.snapshot.graph), ["collections", "edges", "nodes"]);
    assert.equal(out.addedNodes[0]!.collectionId, "owned");
    assert.equal(out.addedNodes[0]!.status, "pending");
    return view(out);
  });
});

test(`${surface}: expansion diagnostic precedence and transactional validation`, () => {
  paired((apply) => {
    const seed = snapshot([node("a"), node("b")]);
    seed.graph.edges = [{ from: "a", to: "b" }];
    const c = collection();
    const cases: [unknown, string][] = [
      [
        { nodes: [{ id: "a", title: "duplicate" }], edges: [{ from: "x", to: "x" }] },
        "Planner returned duplicate workflow node: a",
      ],
      [
        {
          nodes: [
            { id: "c", title: "C" },
            { id: "c", title: "again" },
          ],
        },
        "Planner returned duplicate workflow node: c",
      ],
      [{ edges: [{ from: "x", to: "x" }] }, "Planner returned a self-loop edge: x -> x"],
      [{ edges: [{ from: "x", to: "y" }] }, "Planner returned an edge with unknown source node: x"],
      [{ edges: [{ from: "a", to: "x" }] }, "Planner returned an edge with unknown target node: x"],
      [{ edges: [{ from: "a", to: "b" }] }, "Planner returned duplicate workflow edge: a->b"],
      [
        { edges: [{ from: "b", to: "a" }] },
        "Planner returned an edge that would create a cycle: b->a",
      ],
      [
        {
          nodes: [{ id: "c", title: "C" }],
          edges: [
            { from: "b", to: "c" },
            { from: "c", to: "a" },
          ],
        },
        "Planner returned an edge that would create a cycle: c->a",
      ],
      [
        {
          nodes: [{ id: "c", title: "C" }],
          edges: [
            { from: "b", to: "c" },
            { from: "b", to: "c" },
          ],
        },
        "Planner returned duplicate workflow edge: b->c",
      ],
    ];
    const before = JSON.stringify(seed),
      errors = [];
    for (const [raw, message] of cases) {
      assert.throws(() => apply(seed, c, result(raw), [], "now"), { name: "Error", message });
      errors.push(message);
      assert.equal(JSON.stringify(seed), before);
    }
    let malformed: unknown;
    try {
      apply(seed, c, result({ nodes: [{ id: "a", title: 42 }] }), [], "now");
    } catch (e) {
      malformed = e;
    }
    assert.equal((malformed as Error).name, "ZodError");
    return { errors, malformed: JSON.parse(JSON.stringify(malformed)) };
  });
});

test(`${surface}: expansion no-op transitions, completion bookkeeping and omission`, () => {
  paired((apply) => {
    const observations = [];
    for (const [status, frontier, unseen, explicit, expected] of [
      ["active", false, [], undefined, "draining"],
      ["draining", false, [], undefined, "exhausted"],
      ["exhausted", false, [], false, "draining"],
      ["draining", true, [], undefined, "active"],
      ["draining", false, ["done"], undefined, "active"],
      ["active", true, ["done"], true, "exhausted"],
    ] as const) {
      const c = collection({ status, nodeIds: frontier ? ["a"] : [], lastGraphChangeAt: "old" });
      const seed = snapshot(frontier ? [node("a")] : []);
      seed.graph.collections = [c];
      const out = apply(seed, c, result({ exhausted: explicit }), unseen, "now");
      assert.equal(out.collection.status, expected);
      assert.equal(out.collection.exhausted, expected === "exhausted");
      assert.equal(out.collection.lastGraphChangeAt, "old");
      assert.equal(out.snapshot.updatedAt, "now");
      assert.notEqual(out.snapshot, seed);
      assert.notEqual(out.snapshot.graph, seed.graph);
      assert.notEqual(out.snapshot.graph.nodes, seed.graph.nodes);
      assert.notEqual(out.snapshot.graph.edges, seed.graph.edges);
      observations.push(view(out));
    }
    const seed = snapshot([]);
    delete seed.graph.collections;
    for (const membership of [undefined, []]) {
      const out = apply(
        seed,
        collection(),
        result({ nodes: [{ id: "n", title: "N" }], collectionNodeIds: membership }),
        [],
        "now",
      );
      assert.deepEqual(out.collection.nodeIds, membership ?? ["n"]);
      assert.deepEqual(out.snapshot.graph.collections, []);
      observations.push(view(out));
    }
    return observations;
  });
});

test(`${surface}: expansion explicit reservations and existing cyclic graph`, () => {
  paired((apply) => {
    const seed = snapshot([node("a"), node("b")]);
    seed.graph.edges = [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ];
    const out = apply(
      seed,
      collection(),
      result({
        nodes: [{ id: "c", title: "C", dependsOn: ["a", "b", "a"] }],
        edges: [{ from: "b", to: "c" }],
      }),
      [],
      "now",
    );
    assert.deepEqual(out.addedEdges, [
      { from: "b", to: "c" },
      { from: "a", to: "c" },
    ]);
    const collision = snapshot([node("a->b"), node("c"), node("a"), node("b->c")]);
    collision.graph.edges = [{ from: "a->b", to: "c" }];
    assert.throws(
      () =>
        apply(collision, collection(), result({ edges: [{ from: "a", to: "b->c" }] }), [], "now"),
      { message: "Planner returned duplicate workflow edge: a->b->c" },
    );
    return view(out);
  });
});

test(`${surface}: expansion exact source/emitted selection fails closed`, async () => {
  assert.equal(current.applyPlannerExpansion, actual.applyPlannerExpansion);
  assert.notEqual(current.applyPlannerExpansion, historical.applyPlannerExpansion);
  const missing = new Error("Owned missing expansion artifact");
  await assert.rejects(loadHistorical(async () => "wrong"));
  await assert.rejects(
    loadHistorical(async () => {
      throw missing;
    }),
    (e) => e === missing,
  );
  for (const suffix of [
    "src/workflow/scheduler/planner-expansion.ts",
    "dist/workflow/scheduler/planner-expansion.js",
    "dist/workflow/scheduler/planner-expansion.d.ts",
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
