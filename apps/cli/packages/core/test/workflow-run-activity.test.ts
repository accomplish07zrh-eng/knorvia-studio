import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  archive,
  declaration,
  rowCases,
  observe,
  sha,
  current,
  old,
  entry,
  oldEntry,
  handlers,
  createToolRegistry,
  consumerCases,
  consumer,
  completionEdges,
  delayed,
} from "./workflow-run-activity-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./workflow-run-activity-contract.json", import.meta.url), "utf8"),
);
const digest = (v: any) => sha(JSON.stringify(v));
test("Workflow activity public declarations and supported GetWorkflowRun registry/model consumer", () => {
  assert.equal(declaration, archive.declaration);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeDynamicWorkflow: true });
  assert.equal(registry.get("GetWorkflowRun"), entry);
  assert.equal(oldEntry.handler, entry.handler);
  assert.equal(entry.formatModelContent({}), "GetWorkflowRun returned an invalid result.");
  assert.equal(oldEntry.formatModelContent({}), entry.formatModelContent({}));
  for (const key of [
    "inputSchema",
    "outputSchema",
    "runtimeInputSchema",
    "runtimeOutputSchema",
    "permission",
    "timeout",
    "cancellation",
    "trace",
  ])
    assert.equal(oldEntry[key], entry[key]);
});
test("Workflow activity frozen route/getter/coercion/native callback contracts and repeat calls", () => {
  for (const [i, c] of rowCases.entries()) {
    const baseline = observe(c, old);
    assert.equal(digest(baseline), gold.direct[i], `baseline:${i}`);
    assert.deepEqual(observe(c, current), baseline, `current:${i}`);
    assert.deepEqual(observe(c, current), baseline, `repeat:${i}`);
  }
});
test("Workflow activity full call-runner preserves model/display/result events and telemetry", async () => {
  for (const [i, c] of consumerCases.entries()) {
    const baseline = await consumer(c, oldEntry);
    assert.equal(digest(baseline), gold.consumers[i], `baseline:${i}`);
    assert.deepEqual(await consumer(c), baseline, `current:${i}`);
    assert.equal(baseline.calls, 1);
    assert.equal(baseline.formats, 1);
  }
});
test("Workflow activity model-completion abort edges and early control keep executor settlement", async () => {
  for (const [i, c] of completionEdges.entries()) {
    const baseline = await consumer({}, oldEntry, c);
    assert.equal(digest(baseline), gold.edges[i], `baseline:${i}`);
    assert.deepEqual(await consumer({}, entry, c), baseline, `current:${i}`);
  }
  assert.deepEqual(
    await consumer({}, entry, undefined, true),
    await consumer({}, oldEntry, undefined, true),
  );
});
test("Workflow activity delayed concurrent/stale journal completion stays owned by executor", async () => {
  for (const stale of [false, true])
    assert.deepEqual(await delayed(entry, stale), await delayed(oldEntry, stale));
});
