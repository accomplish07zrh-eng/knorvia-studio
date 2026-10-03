import assert from "node:assert/strict";
import test from "node:test";
import {
  baseline,
  clock,
  consumer,
  current,
  gap,
  graphInput,
} from "./create-workflow-graph-bounds-implementation-fixture.js";

test("graph projection evaluates omitted phase fields and preserves lazy source-count reads", () => {
  for (const kind of ["phase-overflow", "lazy-count", "eager-count"] as const) {
    const old = gap(baseline, kind);
    assert.deepEqual(gap(current, kind), old, kind);
    assert.equal(old.success, kind === "lazy-count");
    assert.deepEqual(
      old.tape,
      kind === "phase-overflow"
        ? ["omitted-phase-name"]
        : kind === "lazy-count"
          ? ["participants"]
          : ["participants", "participants"],
    );
    if (!old.success) assert.equal(old.sameFailure, true);
  }
});
test("graph projection owns retained output rows and member copies on repeated calls", () => {
  for (const selected of [baseline, current]) {
    const input = graphInput(),
      before = JSON.stringify(input);
    const first = selected.boundGraphOfAnalysis(input),
      second = selected.boundGraphOfAnalysis(input);
    assert.deepEqual(first, second);
    for (const name of ["steps", "lanes", "participants", "handoffs", "phases"]) {
      assert.notEqual(first[name], second[name]);
      if (first[name].length) assert.notEqual(first[name][0], second[name][0]);
    }
    assert.notEqual(first.steps[0], input.causality.steps[0]);
    assert.notEqual(first.participants[0].steps, input.handoff.participants[0].steps);
    assert.notEqual(first.participants[0].member, input.handoff.participants[0].member);
    assert.notEqual(first.participants[0].member, second.participants[0].member);
    assert.equal(JSON.stringify(input), before);
  }
});
test("registered CreateWorkflow call-runner preserves completion metadata, events and cancellation", async () => {
  await clock(async () => {
    for (const mode of ["normal", "model-begin", "model-end", "early"]) {
      const old = await consumer(baseline, mode);
      assert.deepEqual(await consumer(current, mode), old, mode);
      assert.equal(old.producerCalls, mode === "early" ? 0 : 1);
      assert.ok(old.telemetry.length > 0);
      assert.equal(old.result.success, mode !== "early");
      assert.equal(old.terminal[0].name, mode === "early" ? "finishCancelled" : "finishCompleted");
      assert.equal(old.events.length === 0, mode === "early");
    }
  });
});
test("concurrent registered projection consumers remain isolated", async () => {
  await clock(async () => {
    const pair = (selected: any) =>
      Promise.all([
        consumer(selected, "normal", "Synthetic first"),
        consumer(selected, "model-end", "Synthetic second"),
      ]);
    assert.deepEqual(await pair(current), await pair(baseline));
  });
});
