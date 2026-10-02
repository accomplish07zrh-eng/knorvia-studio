import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { targetCorners } from "./causality-reduction-target-fixture.js";
import {
  analysis,
  analyze,
  baseline,
  current,
  dynamic,
  fold,
  graphs,
  indices,
  kinds,
  lattice,
  loadCurrent,
  oldAnalyze,
  oldFold,
  oldPhaseModule,
  phase,
  phaseInput,
  scripts,
  sha,
} from "./causality-reduction-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./causality-reduction-contract.json", import.meta.url), "utf8"),
);
const digest = (v: unknown) => sha(JSON.stringify(v));

test("typed reducer public exports/declarations remain fixed and actual artifacts fail closed", async () => {
  assert.equal((await loadCurrent()).reduceOrdering, current.reduceOrdering);
  assert.equal((await dynamic("index")).reduceOrdering, current.reduceOrdering);
  assert.equal((await dynamic("projections")).reduceOrdering, current.reduceOrdering);
  assert.notEqual(current.reduceOrdering, baseline.reduceOrdering);
  assert.deepEqual(current.KIND_RANK, { carry: 0, control: 4, data: 3, fifo: 2, seq: 1 });
  await assert.rejects(
    loadCurrent(async (url) =>
      url.pathname.endsWith(".js") ? "wrong artifact" : readFile(url, "utf8"),
    ),
    assert.AssertionError,
  );
  await assert.rejects(
    loadCurrent(async (url) => {
      if (url.pathname.endsWith(".js"))
        throw Object.assign(new Error("Synthetic missing artifact"), { code: "ENOENT" });
      return readFile(url, "utf8");
    }),
    /Synthetic missing artifact/u,
  );
});
test("typed strength lattice stays independent of exported dedup rank", () => {
  for (const target of kinds)
    for (const hop of kinds) {
      const edges = lattice(target, hop),
        key = `${target}/${hop}`;
      const old = indices(baseline, edges);
      assert.deepEqual(old, gold.lattice[key]);
      assert.deepEqual(indices(current, edges), old, key);
      const strength: Record<string, number> = { data: 3, control: 3, fifo: 2, seq: 1 };
      assert.deepEqual(old, strength[hop]! >= strength[target]! ? [1, 2] : [0, 1, 2]);
    }
  for (const selected of [baseline, current]) {
    const rank = { ...selected.KIND_RANK };
    try {
      Object.assign(selected.KIND_RANK, { data: 0, control: 0, seq: 100 });
      assert.deepEqual(indices(selected, lattice("data", "seq")), [0, 1, 2]);
    } finally {
      Object.assign(selected.KIND_RANK, rank);
    }
  }
});
test("forward reduction preserves greedy cyclic order, direct duplicates and alias deletion", () => {
  for (const c of graphs.slice(0, 10)) {
    const old = indices(baseline, c.edges);
    assert.deepEqual(old, gold.graphs[c.name], c.name);
    assert.deepEqual(indices(current, c.edges), old, c.name);
  }
  assert.deepEqual(gold.graphs["cycle-greedy"], [1, 2, 3]);
  assert.deepEqual(gold.graphs["cycle-reordered"], [1, 2, 3]);
  assert.deepEqual(gold.graphs["alias-deletion"], [1, 2]);
  for (const c of targetCorners().slice(0, 1)) {
    assert.deepEqual(indices(baseline, c.edges), c.expected, c.name);
    assert.deepEqual(indices(current, c.edges), c.expected, c.name);
  }
});
test("carry reduction requires exactly one eligible surviving bridge and defaults to hard strength", () => {
  for (const c of graphs.slice(10)) {
    const old = indices(baseline, c.edges);
    assert.deepEqual(old, gold.graphs[c.name], c.name);
    assert.deepEqual(indices(current, c.edges), old, c.name);
  }
  for (const name of [
    "zero-carry",
    "two-carries",
    "carry-default-hard",
    "weak-carry",
    "weak-carry-suffix",
  ])
    assert.deepEqual(gold.graphs[name], [0, 1, 2], name);
  assert.deepEqual(gold.graphs["parallel-carry"], [1]);
  assert.deepEqual(gold.graphs["alias-carry"], [0, 0]);
  assert.deepEqual(gold.graphs["alias-carry-deletion"], [2]);
  for (const c of targetCorners().slice(1)) {
    assert.deepEqual(indices(baseline, c.edges), c.expected, c.name);
    assert.deepEqual(indices(current, c.edges), c.expected, c.name);
  }
});
test("reduction keeps original edge/extras identity without mutation or cross-call state", () => {
  for (const c of graphs) {
    const input = c.edges,
      before = JSON.stringify(input);
    for (const edge of input) Object.freeze(edge);
    Object.freeze(input);
    for (const selected of [baseline, current]) {
      const first = selected.reduceOrdering(input),
        second = selected.reduceOrdering(input);
      assert.notEqual(first, input);
      assert.notEqual(first, second);
      assert.deepEqual(first, second);
      assert.deepEqual(
        first.map((edge: any) => input.indexOf(edge)),
        gold.graphs[c.name],
      );
      assert.equal(JSON.stringify(input), before);
    }
  }
});
test("actual phase, causality and CLI quotient consumers preserve graph outputs", () => {
  for (const [index, which] of [10, 4, 12].entries()) {
    const input = phaseInput(graphs[which]!.edges),
      before = JSON.stringify(input);
    const old = oldPhaseModule.projectPhaseGraph(...input);
    assert.equal(digest(old), gold.phase[index]);
    assert.deepEqual(phase.projectPhaseGraph(...input), old);
    assert.equal(JSON.stringify(input), before);
    assert.equal(phase.projectPhaseGraph(input[0], [], input[2], input[3], input[4]), input[0]);
  }
  for (const [index, script] of scripts.entries()) {
    const old = analysis(oldAnalyze, script);
    assert.equal(digest(old), gold.analysis[index]);
    assert.deepEqual(analysis(analyze, script), old);
  }
  for (const [index, c] of [graphs[4]!, graphs[10]!, graphs[15]!].entries()) {
    const input = c.edges.map((e) => ({ from: e.from, to: e.to, back: e.kind === "carry" }));
    const old = oldFold.foldPhaseEdges(input);
    assert.equal(digest(old), gold.fold[index]);
    assert.deepEqual(fold.foldPhaseEdges(input), old);
  }
});
