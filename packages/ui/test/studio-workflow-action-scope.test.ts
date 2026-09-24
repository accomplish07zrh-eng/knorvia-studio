import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowActionScope } from "../src/studio/workflow/workflowActionScope.js";

test("an acknowledgement may update the original workflow view", () => {
  const view = { selectedId: "original", service: {} };
  const scope = createWorkflowActionScope(() => view);
  const isCurrent = scope.capture();
  assert.equal(isCurrent(), true);
  if (isCurrent()) view.selectedId = "copy";
  assert.equal(view.selectedId, "copy");
});

test("a deferred import cannot replace a later selected workflow or display its error", async () => {
  const view = { selectedId: "original", service: {} };
  const scope = createWorkflowActionScope(() => view);
  const isCurrent = scope.capture();
  let complete!: () => void;
  let error = "";
  const acknowledgement = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const operation = acknowledgement.then(() => {
    if (isCurrent()) view.selectedId = "imported";
    if (isCurrent()) error = "late failure";
  });
  view.selectedId = "another";
  scope.invalidate();
  complete();
  await operation;
  assert.equal(view.selectedId, "another");
  assert.equal(error, "");
});

test("returning to the same workflow does not revive an old navigation receipt", () => {
  const view = { selectedId: "original", service: {} };
  const scope = createWorkflowActionScope(() => view);
  const isCurrent = scope.capture();
  view.selectedId = "another";
  scope.invalidate();
  view.selectedId = "original";
  scope.invalidate();
  assert.equal(isCurrent(), false);
  assert.equal(scope.capture()(), true);
});

test("service replacement and remount each invalidate outstanding UI work", () => {
  const view = { selectedId: "original", service: {} };
  const scope = createWorkflowActionScope(() => view);
  const oldService = scope.capture();
  view.service = {};
  assert.equal(oldService(), false);
  const unmounted = scope.capture();
  scope.dispose();
  assert.equal(unmounted(), false);
  scope.activate();
  assert.equal(unmounted(), false);
  assert.equal(scope.capture()(), true);
});
