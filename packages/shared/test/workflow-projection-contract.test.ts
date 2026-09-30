import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fixtureRun,
  fixtureNode,
  freezeWorkflow,
  loadWorkflowHelpers,
  observeWorkflow,
  workflowContractCases,
} from "./workflow-projection-cases.js";

const api = await loadWorkflowHelpers();
const frozen = JSON.parse(
  await readFile(new URL("workflow-projection-observations.json", import.meta.url), "utf8"),
);
const cases = workflowContractCases();
test("workflow frozen inventory is unchanged and tied to the prior handoff", () => {
  assert.equal(frozen.baseline, "bc36df98da36e56cda66051137b99d31f2184666");
  assert.deepEqual(
    Object.keys(frozen.observations),
    cases.map(({ key }) => key),
  );
});
for (const { key, run } of cases)
  test(`workflow contract: ${key}`, () =>
    assert.deepEqual(
      observeWorkflow(() => run(api)),
      frozen.observations[key],
    ));
test("phase replay is monotonic and only the matched update path is copied", () => {
  const original = freezeWorkflow(
    fixtureRun({
      phases: [
        { name: "first", rounds: 3 },
        { name: "second", rounds: 2 },
      ],
    }),
  );
  const replay = api.reducePhaseEntered(original, { name: "first", ordinal: 1 });
  assert.equal(replay.phases, original.phases);
  const advance = api.reducePhaseEntered(original, { name: "first", ordinal: 4 });
  assert.notEqual(advance.phases, original.phases);
  assert.equal(advance.phases![1], original.phases![1]);
  assert.equal(advance.nodes, original.nodes);
});
test("phase adjacency preserves negative zero, input order and protected first occurrence", () => {
  const result = api.reduceRunLaunched(freezeWorkflow(fixtureRun()), {
    phaseNames: ["first", "second"],
    phaseAlongside: [
      [1, 1],
      [-0, 0],
    ],
  });
  assert.deepEqual(result.phaseAlongside![0], [1]);
  assert.ok(Object.is(result.phaseAlongside![1]![0], -0));
});
test("new asks reset counts while ordinary progress preserves lifecycle and input", () => {
  const previous = freezeWorkflow(fixtureNode());
  assert.deepEqual(api.carryNodeProgress("node-queued", {}, previous), {});
  assert.deepEqual(api.carryNodeProgress("node-settled", { cached: true }, previous), {
    instructionsHead: "fixture task",
  });
  const run = freezeWorkflow(fixtureRun());
  const changed = api.reduceNodeProgress(
    run,
    { siteId: "fixture-site", ordinal: 1 },
    { turn: 1, toolCalls: 0 },
  );
  assert.equal(changed.nodes[0]!.phase, "executing");
  assert.equal(changed.nodes[0]!.turn, 1);
  assert.equal(changed.nodes[0]!.toolCalls, 0);
  assert.equal(run.nodes[0]!.turn, 9);
  assert.equal(changed.nodes[0]!.lastTool, run.nodes[0]!.lastTool);
});
