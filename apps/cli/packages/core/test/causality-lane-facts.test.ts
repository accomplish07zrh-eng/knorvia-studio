import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyze,
  baseline,
  cases,
  current,
  factConsumer,
  observe,
  oldAnalyze,
  scripts,
  sha,
  traceJoin,
  weakestPort,
} from "./causality-lane-facts-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./causality-lane-facts-contract.json", import.meta.url), "utf8"),
);
const digest = (value: unknown) => sha(JSON.stringify(value));

test("fact aggregation rank, optional fields, provenance and key order stay frozen", () => {
  for (const c of cases) {
    const old = observe(baseline, c.make());
    assert.deepEqual(old, gold.direct[c.name], c.name);
    assert.deepEqual(observe(current, c.make()), old, c.name);
  }
});
test("fact joins preserve getter, iterable receiver and thrown-error order", () => {
  for (const at of [undefined, "kind", "toPhases", "iterator"]) {
    const old = traceJoin(baseline, at);
    assert.deepEqual(old, gold.reads[at ?? "normal"]);
    assert.deepEqual(traceJoin(current, at), old);
  }
});
test("fact records and phase sets remain independent across calls and input aliases", () => {
  for (const selected of [baseline, current]) {
    const input = cases[5]!.make();
    const first = selected.dedupeFacts(input),
      second = selected.dedupeFacts(input);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    assert.notEqual(first[0].toPhases, second[0].toPhases);
    assert.notEqual(first[0].toPhases, first[1].toPhases);
    assert.deepEqual([...input[0]!.toPhases!], ["p"]);
  }
});
test("weakest retains fixed membership semantics, receiver and error ownership", () => {
  for (const values of [[], ["always"], ["always", "maybe"], ["maybe", "always"]]) {
    assert.equal(current.weakest(values), baseline.weakest(values));
    assert.equal(current.weakest(values), values.includes("maybe") ? "maybe" : "always");
  }
  for (const throws of [false, true]) {
    const old = weakestPort(baseline, throws);
    assert.deepEqual(old, gold.weakest[String(throws)]);
    assert.deepEqual(weakestPort(current, throws), old);
  }
});
test("actual phase/jump graph consumers retain public outputs after fact aggregation", () => {
  for (const [index, script] of scripts.entries()) {
    const old = factConsumer(oldAnalyze, script);
    assert.equal(digest(old), gold.consumers[index]);
    assert.deepEqual(factConsumer(analyze, script), old);
  }
});
