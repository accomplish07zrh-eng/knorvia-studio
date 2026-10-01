import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cases,
  observe,
  old,
  current,
  sha,
  declaration,
  archive,
  consumerCases,
  project,
  oldAnalysis,
  consumer,
  entry,
  handlers,
  createToolRegistry,
  clock,
} from "./create-workflow-graph-fold-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./create-workflow-graph-fold-contract.json", import.meta.url), "utf8"),
);
const digest = (value: any) => sha(JSON.stringify(value));
test("phase graph public declaration and registry remain fixed", () => {
  assert.equal(declaration, archive.declaration);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeDynamicWorkflow: true });
  assert.equal(registry.get("CreateWorkflow"), entry);
  assert.equal(
    digest({
      metadata: entry.metadata,
      permission: entry.permission,
      inputSchema: entry.inputSchema,
      outputSchema: entry.outputSchema,
    }),
    gold.public,
  );
});
test("phase components preserve frozen pairs, cycles, malformed input, getter/coercion order and ownership", () => {
  assert.equal(cases.length, 24);
  for (const [i, c] of cases.entries()) {
    const baseline = observe(c, old);
    assert.equal(digest(baseline), gold.direct[i], `baseline:${i}`);
    assert.deepEqual(observe(c, current), baseline, `current:${i}`);
    assert.deepEqual(observe(c, current), baseline, `repeat:${i}`);
  }
});
test("phase components keep input facts and intra-component competing branch edges", () => {
  const raw = [
    { from: "a", to: "b", back: false },
    { from: "b", to: "a", back: false },
    { from: "root", to: "a", back: false },
    { from: "root", to: "b", back: false },
  ];
  const snapshot = structuredClone(raw);
  assert.deepEqual(current.foldPhaseEdges(raw), raw);
  assert.deepEqual(raw, snapshot);
});
test("phase components preserve actual bounds and analysis/display consumers including whole-vocabulary limits", () => {
  for (const [i, c] of consumerCases.entries()) {
    const baseline = project(c, oldAnalysis);
    assert.equal(digest(baseline), gold.project[i], `baseline:${c}`);
    assert.deepEqual(project(c), baseline, `current:${c}`);
    assert.equal(baseline.valid, true);
    if (c === "phase-limit" || c === "edge-limit") {
      assert.equal(baseline.graph.truncated, true);
      assert.equal(Object.hasOwn(baseline.graph, "phases"), false);
      assert.ok(baseline.graph.steps.every((step: any) => !Object.hasOwn(step, "phase")));
    }
  }
});
test("phase graph output through full call-runner retains completion-edge and early cancellation contracts", () =>
  clock(async () => {
    for (const [i, c] of ["normal", "model-begin", "model-end", "early"].entries()) {
      const baseline = await consumer(oldAnalysis, c);
      assert.equal(digest(baseline), gold.executor[i], `baseline:${c}`);
      assert.deepEqual(await consumer(undefined, c), baseline, `current:${c}`);
    }
  }));
test("phase component calls share no mutable graph state across concurrent result consumers", () =>
  clock(async () => {
    const baseline = await Promise.all([
      consumer(oldAnalysis, "normal", "cycle"),
      consumer(oldAnalysis, "normal", "dag"),
    ]);
    assert.equal(digest(baseline), gold.concurrent);
    assert.deepEqual(
      await Promise.all([
        consumer(undefined, "normal", "cycle"),
        consumer(undefined, "normal", "dag"),
      ]),
      baseline,
    );
  }));
