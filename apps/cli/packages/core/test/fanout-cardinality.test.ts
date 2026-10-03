import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyze,
  baseline,
  cases,
  consumer,
  current,
  loadCurrent,
  observe,
  oldAnalyze,
  scripts,
  sha,
} from "./fanout-cardinality-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./fanout-cardinality-contract.json", import.meta.url), "utf8"),
);
const digest = (value: unknown) => sha(JSON.stringify(value));

test("literal-cardinality positive array proof and symbol-write contracts stay frozen", () => {
  for (const [index, c] of cases.entries()) {
    const old = observe(baseline, c);
    assert.equal("value" in old && old.value, c.expected, c.name);
    assert.deepEqual(old, gold.direct[index], c.name);
    assert.deepEqual(observe(current, c), old, c.name);
  }
});
test("literal-cardinality checker receivers and failures remain owned by caller", () => {
  for (const at of [1, 2, 4]) {
    const old = observe(baseline, cases[5]!, at);
    assert.deepEqual(old, gold.errors[String(at)]);
    assert.deepEqual(observe(current, cases[5]!, at), old);
  }
});
test("literal-cardinality strict current artifacts never fall back to old oracle", async () => {
  assert.equal((await loadCurrent()).literalCardinality, current.literalCardinality);
  assert.notEqual(current.literalCardinality, baseline.literalCardinality);
  for (const suffix of [".ts", ".js", ".d.ts"]) {
    await assert.rejects(
      loadCurrent(async (url) =>
        url.pathname.endsWith(suffix) ? "wrong artifact" : readFile(url, "utf8"),
      ),
      assert.AssertionError,
    );
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.pathname.endsWith(suffix)) throw new Error("Owned missing artifact");
        return readFile(url, "utf8");
      }),
      /Owned missing artifact/u,
    );
  }
});
test("actual virtual interpreter core and handoff renderers preserve fan-out semantics", () => {
  for (const [index, script] of scripts.entries()) {
    const old = consumer(oldAnalyze, script);
    assert.equal(digest(old), gold.consumers[index]);
    assert.deepEqual(consumer(analyze, script), old);
  }
});
