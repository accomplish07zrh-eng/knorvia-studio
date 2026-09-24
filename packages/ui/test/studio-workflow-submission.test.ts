import assert from "node:assert/strict";
import test from "node:test";
import { submitWorkflowRun } from "../src/studio/workflow/workflowSubmission.js";

test("stop during definition save prevents a late run and does not acknowledge its input", async () => {
  let stopEpoch = 0;
  let release!: () => void;
  const saved = new Promise<void>((resolve) => {
    release = resolve;
  });
  const actions: string[] = [];
  const originalEpoch = stopEpoch;
  const pending = submitWorkflowRun({
    save: () => saved,
    send: async () => {
      actions.push("send");
    },
    canSubmit: () => stopEpoch === originalEpoch,
  });
  stopEpoch++;
  release();
  assert.equal(await pending, false);
  assert.deepEqual(actions, []);
});

test("workflow input is accepted only after both definition and run acknowledgements", async () => {
  const actions: string[] = [];
  assert.equal(
    await submitWorkflowRun({
      save: async () => {
        actions.push("save");
      },
      send: async () => {
        actions.push("send");
      },
      canSubmit: () => true,
    }),
    true,
  );
  assert.deepEqual(actions, ["save", "send"]);
  await assert.rejects(
    submitWorkflowRun({
      save: async () => {},
      send: async () => {
        throw new Error("lost receipt");
      },
      canSubmit: () => true,
    }),
    /lost receipt/,
  );
});
