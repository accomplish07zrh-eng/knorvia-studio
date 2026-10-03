import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  baseline,
  cases,
  coercion,
  current,
  frozen,
  observe,
  sha,
} from "./create-workflow-graph-quotient-fixture.js";
const digest = (value: unknown) => sha(JSON.stringify(value));
test("quotient rewrite preserves accepted helpers, public prose and declarations", async () => {
  const declaration = await readFile(
    new URL("../dist/tool/handlers/create-workflow-graph-fold.d.ts", import.meta.url),
    "utf8",
  );
  assert.equal(sha(declaration), frozen.declarationSha256);
  assert.equal(frozen.baseline, "d168c048cbac2b89770fae77181119252266d9dc");
});
test("quotient admission and ordered expansion preserve frozen candidate kinds and original edges", () => {
  assert.equal(cases.length, 5);
  for (const [index, input] of cases.entries()) {
    const expected = observe(input, baseline);
    assert.equal(digest(expected), frozen.direct[index]);
    assert.deepEqual(observe(input, current), expected);
    assert.deepEqual(observe(input, current), expected);
  }
});
test("quotient keys preserve successful and late-failing coercion across reduction", () => {
  for (const [index, at] of [0, 5].entries()) {
    const expected = coercion(at, baseline);
    assert.equal(digest(expected), frozen.coercion[index]);
    assert.deepEqual(coercion(at, current), expected);
    if (at === 0) assert.ok(expected.tape.length >= 5);
    else {
      assert.equal(expected.sameFailure, true);
      assert.equal(expected.tape.length, at);
    }
  }
});
