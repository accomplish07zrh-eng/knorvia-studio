import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  names,
  observation,
  lateFailure,
  sha,
} from "./create-workflow-graph-bounds-review-fixture.js";
const gold = JSON.parse(
  await readFile(
    new URL("./create-workflow-graph-bounds-review-contract.json", import.meta.url),
    "utf8",
  ),
);
const digest = (value: unknown) => sha(JSON.stringify(value));
test("graph-bounds review pins actual graph, approval/display and result-display caller observations", () => {
  assert.equal(names.length, 5);
  for (const [index, name] of names.entries()) {
    const result = observation(name);
    assert.equal(digest(result), gold.caller[index], name);
    assert.equal(result.graphValid, true);
    assert.equal(result.displayValid, true);
    assert.deepEqual(result.create, result.amend);
    assert.deepEqual(result.create, result.routed);
  }
});
test("graph-bounds reference pruning preserves declared order, duplicate membership and source links", () => {
  const { graph } = observation("closure");
  assert.deepEqual(
    graph.lanes.map((lane: any) => lane.id),
    ["b", "a"],
  );
  assert.deepEqual(
    graph.steps.map((step: any) => step.id),
    ["s0", "s2"],
  );
  assert.deepEqual(graph.steps[0].lanes, ["a", "b", "b"]);
  assert.equal(graph.steps[0].source, "original-site");
  assert.deepEqual(graph.participants[0].steps, ["s0", "s0"]);
  assert.deepEqual(graph.handoffs[0].types, [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
  ]);
  assert.deepEqual(graph.exits, ["last", "marker"]);
  assert.deepEqual(graph.phases[0].alongside, ["last"]);
  assert.equal(graph.truncated, true);
});
test("graph-bounds capacity and clipped-identity decisions remain exact", () => {
  const lane = observation("step-lane-limit").graph;
  assert.equal(lane.lanes.length, 32);
  assert.equal(lane.steps.length, 63);
  assert.equal(
    lane.steps.some((step: any) => step.id === "s32" || step.id === "s64"),
    false,
  );
  assert.equal(Object.hasOwn(lane.steps[0], "lanes"), false);
  assert.equal(observation("card-limit").graph.participants.length, 64);
  assert.equal(observation("card-limit").graph.handoffs.length, 1);
  assert.equal(observation("handoff-limit").graph.handoffs.length, 256);
  const clipped = observation("clipped-identities").graph;
  assert.equal(clipped.phases[0].name, "n".repeat(127));
  assert.equal(clipped.handoffs.length, 1);
  assert.equal(clipped.participants[0].phase, "unphased");
  assert.equal(Object.hasOwn(clipped, "truncated"), true);
});
test("graph-bounds projects over-capacity card and handoff fields before slicing", () => {
  for (const [index, kind] of ["card-limit", "handoff-limit"].entries())
    for (const operation of ["graph", "display"]) {
      const result = lateFailure(kind, operation);
      assert.equal(digest(result), gold.errors[index]);
      assert.equal(result.sameFailure, true);
      assert.deepEqual(result.tape, ["tail-field"]);
    }
});
