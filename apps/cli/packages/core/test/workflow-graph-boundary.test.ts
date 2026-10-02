import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as published from "@knorvia/contracts";
import { current, loadCurrent, surface } from "./workflow-scheduler-state-fixture.js";
import { current as graph, loadCurrent as loadGraph } from "./workflow-ready-order-fixture.js";
const root = new URL("../../", import.meta.url);
const folder = surface === "source" ? "src" : "dist";
const extension = surface === "source" ? "ts" : "js";
const internalState = await import(
  new URL(`contracts/${folder}/workflow/scheduler-state.${extension}`, root).href
);
const internalOrder = await import(
  new URL(`core/${folder}/workflow/scheduler/ready-order.${extension}`, root).href
);
const internalHelpers = await import(
  new URL(`core/${folder}/workflow/scheduler/graph-helpers.${extension}`, root).href
);
const emittedWorkflow = await import(new URL("contracts/dist/workflow/index.js", root).href);
test(`${surface}: graph boundaries preserve public function and schema identities`, () => {
  assert.equal(current.deriveWorkflowSchedulerState, internalState.deriveWorkflowSchedulerState);
  assert.equal(current.WorkflowSchedulerStateSchema, internalState.WorkflowSchedulerStateSchema);
  assert.equal(graph.orderedReadyExecutableNodes, internalOrder.orderedReadyExecutableNodes);
  for (const [name, value] of Object.entries(internalHelpers))
    assert.equal(graph[name as keyof typeof graph], value);
  assert.deepEqual(
    Object.keys(graph).sort(),
    [...Object.keys(internalHelpers), "orderedReadyExecutableNodes"].sort(),
  );
  assert.equal(current.ExpertWorkflowStrategySchema, current.WorkflowStrategySchema);
  assert.equal(current.ExpertWorkflowRunSnapshotSchema, current.WorkflowRunSnapshotSchema);
  assert.equal(
    published.deriveWorkflowSchedulerState,
    emittedWorkflow.deriveWorkflowSchedulerState,
  );
  assert.equal(published.WorkflowRunSnapshotSchema, emittedWorkflow.WorkflowRunSnapshotSchema);
  assert.equal(current.WorkflowGraphSchema.shape.nodes.element, current.WorkflowGraphNodeSchema);
  assert.equal(
    current.WorkflowSchedulerDerivedNodeSchema.shape.node,
    current.WorkflowGraphNodeSchema,
  );
  assert.equal(
    current.WorkflowSchedulerCollectionStateSchema.shape.collection,
    current.WorkflowGraphCollectionSchema,
  );
  assert.equal(current.WorkflowRunSnapshotSchema.shape.graph, current.WorkflowGraphSchema);
});
test(`${surface}: graph boundaries reject wrong or missing private artifacts`, async () => {
  const missing = new Error("Owned missing relocated artifact");
  for (const [loader, suffix] of [
    [loadCurrent, "contracts/src/workflow/scheduler-state.ts"],
    [loadCurrent, "contracts/dist/workflow/run-schema.js"],
    [loadGraph, "core/dist/workflow/scheduler/ready-order.d.ts"],
  ] as const) {
    await assert.rejects(
      loader((url) =>
        url.pathname.endsWith(suffix) ? Promise.resolve("wrong") : readFile(url, "utf8"),
      ),
    );
    await assert.rejects(
      loader((url) => {
        if (url.pathname.endsWith(suffix)) throw missing;
        return readFile(url, "utf8");
      }),
      (error) => error === missing,
    );
  }
});
