import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cases,
  observe,
  old,
  current,
  consumerCases,
  consumer,
  edges,
  entry,
  oldEntry,
  declaration,
  archive,
  sha,
  widthCases,
} from "./workflow-run-phase-fixture.js";
import { createToolRegistry, handlers } from "./workflow-run-activity-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./workflow-run-phase-contract.json", import.meta.url), "utf8"),
);
const digest = (value: any) => sha(JSON.stringify(value));
test("Workflow phase public declarations and supported registry remain unchanged", () => {
  assert.equal(declaration, archive.declaration);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeDynamicWorkflow: true });
  assert.equal(registry.get("GetWorkflowRun"), entry);
  assert.equal(oldEntry.handler, entry.handler);
  assert.equal(entry.formatModelContent({}), "GetWorkflowRun returned an invalid result.");
});
test("Workflow phase appended bounded-width malformed/coercion controls", () => {
  for (const [i, kind] of widthCases.entries()) {
    const baseline = observe({ kind }, old);
    assert.equal(digest(baseline), gold.appendedWidth[i], `width-baseline:${i}`);
    assert.deepEqual(observe({ kind }, current), baseline, `width-current:${i}`);
  }
});
test("Workflow phase frozen decision/getter/coercion/native callback contracts and repeat calls", () => {
  assert.equal(cases.length, 29);
  for (const [i, c] of cases.entries()) {
    const baseline = observe(c, old);
    assert.equal(digest(baseline), gold.direct[i], `baseline:${i}`);
    assert.deepEqual(observe(c, current), baseline, `current:${i}`);
    assert.deepEqual(observe(c, current), baseline, `repeat:${i}`);
  }
});
test("Workflow phase actual call-runner preserves live/terminal/empty model and display output", async () => {
  for (const [i, c] of consumerCases.entries()) {
    const baseline = await consumer(c, oldEntry);
    assert.equal(digest(baseline), gold.consumers[i], `baseline:${i}`);
    assert.deepEqual(await consumer(c), baseline, `current:${i}`);
    assert.equal(baseline.calls, 1);
    assert.equal(baseline.formats, 1);
  }
});
test("Workflow phase completion-edge cancellation and early control retain terminal ownership", async () => {
  for (const [i, edge] of edges.entries()) {
    const baseline = await consumer("current", oldEntry, edge);
    assert.equal(digest(baseline), gold.edges[i], `baseline:${i}`);
    assert.deepEqual(await consumer("current", entry, edge), baseline, `current:${i}`);
  }
  assert.deepEqual(
    await consumer("current", entry, undefined, true),
    await consumer("current", oldEntry, undefined, true),
  );
});
