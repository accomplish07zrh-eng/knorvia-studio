import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyze,
  archive,
  baseline,
  barrierCases,
  claimCases,
  consumer,
  current,
  failures,
  guardClaims,
  loadBaseline,
  loadCurrent,
  observeBarrier,
  observeClaim,
  oldAnalyze,
  scripts,
  sha,
  state,
} from "./causality-order-settlement-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./causality-order-settlement-contract.json", import.meta.url), "utf8"),
);
const digest = (value: unknown) => sha(JSON.stringify(value));

test("settlement admission filters phantoms before exact singleton judgment and preserves witness order", () => {
  for (const c of claimCases) {
    const old = observeClaim(baseline, c.make());
    assert.equal(digest(old), gold.claims[c.name], c.name);
    assert.deepEqual(observeClaim(current, c.make()), old, c.name);
  }
  assert.deepEqual(observeClaim(current, claimCases[1]!.make()).result, {
    certain: ["a"],
    maybe: [],
  });
  assert.deepEqual(observeClaim(current, claimCases[4]!.make()).result, {
    certain: [],
    maybe: ["a"],
  });
});
test("settlement empty identity and per-call witness arrays remain owned by their module", () => {
  for (const selected of [baseline, current]) {
    const empty = state(),
      input = claimCases[3]!.make();
    assert.equal(
      selected.settlesAt(empty, empty.awaitNode, 0),
      selected.settlesAt(empty, empty.awaitNode, 7),
    );
    const first = selected.settlesAt(input, input.awaitNode, 0);
    const second = selected.settlesAt(input, input.awaitNode, 0);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first.certain, second.certain);
    assert.deepEqual(first, { certain: ["a"], maybe: [] });
  }
});
test("settlement barrier preserves frame commits, summary order, joins, repeated calls and widening", () => {
  for (const c of barrierCases) {
    const old = observeBarrier(baseline, c.make());
    assert.equal(digest(old), gold.barriers[c.name], c.name);
    assert.deepEqual(observeBarrier(current, c.make()), old, c.name);
  }
});
test("settlement thrown operations retain error identity and partial commit boundaries", () => {
  const old = failures(baseline);
  assert.equal(digest(old), gold.failures);
  assert.deepEqual(failures(current), old);
  assert.deepEqual(old[1]!.calls, ["a", "relay"]);
  assert.deepEqual(old[2]!.settled, [["a"]]);
  assert.equal(old[2]!.events.length, 0);
  assert.deepEqual(old[3]!.joined, ["one"]);
  assert.deepEqual(old[4]!.settled, [["a", "b"]]);
});
test("settlement shared guard lookup keeps syntactic precedence without temporal admission", () => {
  const old = guardClaims(baseline);
  assert.equal(digest(old), gold.guards);
  assert.deepEqual(guardClaims(current), old);
  assert.deepEqual(old[1], [
    { controllers: ["b", "a"], maybeControllers: [], region: "owned-region" },
  ]);
  assert.deepEqual(old[2], [
    { controllers: ["b"], maybeControllers: ["a"], region: "owned-region" },
  ]);
});
test("settlement exact historical oracle and actual current artifacts fail closed", async () => {
  assert.equal((await loadCurrent()).barrier, current.barrier);
  assert.notEqual(current.barrier, baseline.barrier);
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
    loadBaseline(async () => "wrong archive"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadBaseline(async () => {
      throw new Error("Owned missing archive");
    }),
    /Owned missing archive/u,
  );
});
test("settlement actual walk, loop and deferred-call analyzer consumers preserve trace and graph bytes", () => {
  for (const [index, script] of scripts.entries()) {
    const old = consumer(oldAnalyze, script);
    assert.equal(digest(old), gold.consumers[index]);
    assert.deepEqual(consumer(analyze, script), old);
  }
});
