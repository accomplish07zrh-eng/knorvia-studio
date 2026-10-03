import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyze,
  archive,
  baseline,
  cases,
  consumer,
  current,
  loadBaseline,
  loadCurrent,
  observe,
  oldAnalyze,
  readPhases,
  scripts,
  sha,
} from "./may-set-lane-expansion-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./may-set-lane-expansion-contract.json", import.meta.url), "utf8"),
);
const digest = (value: unknown) => sha(JSON.stringify(value));

test("may-set admission, ordered edge products and original reference ownership stay frozen", () => {
  for (const c of cases) {
    const old = observe(baseline, c.make());
    assert.equal(digest(old), gold.direct[c.name], c.name);
    assert.deepEqual(observe(current, c.make()), old, c.name);
  }
  const mixed = baseline.expandMaySetLanes(cases[1]!.make());
  assert.deepEqual(
    mixed.edges.slice(0, 5).map((e: any) => [e.from, e.to]),
    [
      ["x~b", "y~b"],
      ["x~a", "y~b"],
      ["x~a", "y~c"],
      ["x~b", "y~b"],
      ["x~b", "y~c"],
    ],
  );
  assert.equal(mixed.edges.filter((e: any) => e.kind === "carry").length, 4);
  assert.deepEqual(mixed.sink.fedBy, ["y~b", "y~c", "x~a", "x~b", "missing", "x~a", "x~b"]);
});
test("may-set projection preserves read phases, no-op admission and thrown error identity", () => {
  for (const [name, empty, throwAt] of [
    ["normal", false, undefined],
    ["no-op-unread", true, "edges"],
    ["edges-failure", false, "edges"],
    ["sink-failure", false, "sink"],
  ] as const) {
    const old = readPhases(baseline, empty, throwAt);
    assert.deepEqual(old, gold.reads[name], name);
    assert.deepEqual(readPhases(current, empty, throwAt), old, name);
  }
});
test("may-set projection has no generated cross-call state and preserves per-call copy aliases", async () => {
  for (const selected of [baseline, current]) {
    const input = cases[4]!.make(),
      first = selected.expandMaySetLanes(input),
      second = selected.expandMaySetLanes(input);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first.steps[0], second.steps[0]);
    assert.equal(first.steps[0], first.steps[2]);
    assert.equal(first.steps[1], first.steps[3]);
    const concurrent = await Promise.all([
      Promise.resolve().then(() => selected.expandMaySetLanes(input)),
      Promise.resolve().then(() => selected.expandMaySetLanes(input)),
    ]);
    assert.deepEqual(concurrent[0], first);
    assert.deepEqual(concurrent[1], first);
    assert.notEqual(concurrent[0].steps[0], concurrent[1].steps[0]);
  }
});
test("may-set current artifacts and exact historical oracle fail closed", async () => {
  assert.equal((await loadCurrent()).expandMaySetLanes, current.expandMaySetLanes);
  assert.notEqual(current.expandMaySetLanes, baseline.expandMaySetLanes);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
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
  await assert.rejects(
    loadBaseline(async () => "wrong baseline"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadBaseline(async () => {
      throw new Error("Owned missing baseline");
    }),
    /Owned missing baseline/u,
  );
});
test("actual analyzer, phase/browser graph and Mermaid consumers preserve may-set output", () => {
  for (const [index, script] of scripts.entries()) {
    const old = consumer(oldAnalyze, script);
    assert.equal(digest(old), gold.consumers[index]);
    assert.deepEqual(consumer(analyze, script), old);
  }
});
