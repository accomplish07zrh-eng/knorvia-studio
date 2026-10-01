import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  entry,
  baseline,
  cases,
  direct,
  executor,
  edge,
  json,
  sha,
  publicDeclaration,
  handlers,
  createToolRegistry,
  clock,
  executorFixture,
  normalized,
} from "./list-saved-workflows-model-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./list-saved-workflows-model-contract.json", import.meta.url), "utf8"),
);
const digest = (v: any) => sha(JSON.stringify(v));
test("ListSavedWorkflows declarations/schema/metadata and actual registry formatter", () => {
  assert.equal(publicDeclaration, gold.declaration);
  assert.deepEqual(
    json({
      ...entry,
      handler: undefined,
      formatModelContent: undefined,
      runtimeInputSchema: undefined,
      runtimeOutputSchema: undefined,
    }),
    gold.metadata,
  );
  for (const key of ["inputSchema", "outputSchema", "runtimeInputSchema", "runtimeOutputSchema"])
    assert.equal(entry[key], baseline[key]);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeDynamicWorkflow: true });
  assert.equal(registry.get("ListSavedWorkflows"), entry);
  assert.deepEqual(direct({}, registry.get("ListSavedWorkflows")), gold.ordinary);
});
test("ListSavedWorkflows frozen malformed/ordered/prose/default JSON expression", () => {
  for (const [i, c] of cases.entries()) {
    const old = direct(c, baseline);
    assert.equal(digest(old), gold.directDigests[i]);
    assert.deepEqual(direct(c), old, `case:${i}`);
  }
});
test("ListSavedWorkflows actual full executor projection with synthetic listing ports", async () => {
  const cases = [
    {},
    { queued: true },
    { reject: true },
    { early: true },
    { deny: true },
    { output: { workflows: [], invalid: [] } },
  ];
  for (const [i, c] of cases.entries()) {
    const old = await executor(c, baseline);
    assert.equal(digest(old), gold.executorDigests[i]);
    assert.deepEqual(await executor(c), old);
  }
});
test("ListSavedWorkflows queued completion-edge cancellation retains event/telemetry owner", async () => {
  for (let depth = 0; depth < 9; depth++) {
    const old = await edge(baseline, depth);
    assert.equal(digest(old), gold.edgeDigests[depth]);
    assert.deepEqual(await edge(entry, depth), old);
  }
  assert.deepEqual(await edge(entry, 2, true), await edge(baseline, 2, true));
});
test("ListSavedWorkflows repeated and concurrent projections retain independent results", async () => {
  async function observe(selected: any) {
    return clock(async () => {
      const first = executorFixture(selected, { output: { workflows: [] } }),
        second = executorFixture(selected, { queued: true });
      const results = await Promise.all([first.execute(), second.execute()]);
      return [normalized(first, results[0]), normalized(second, results[1])];
    });
  }
  const original = Date;
  const current = await observe(entry);
  assert.equal(Date, original);
  const old = await observe(baseline);
  assert.equal(Date, original);
  assert.deepEqual(current, old);
  assert.equal(direct({}).model, direct({}).model);
});
