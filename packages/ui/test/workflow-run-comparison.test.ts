import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun } from "@knorvia/services";
import { compareWorkflowRuns } from "../src/studio/workflow/workflowComparisonProjection.js";
import { makeWorkflowNode } from "../src/studio/workflow/types.js";

const node = (id: string, label: string) => ({
  ...makeWorkflowNode("agent", { x: 0, y: 0 }, label, id),
});
const result = (status: string, text: string) =>
  JSON.stringify({ status, text, resultKnown: true });
const run = (
  id: string,
  nodes: ReturnType<typeof node>[],
  values: Record<string, string>,
): StudioRun => ({
  id,
  kind: "workflow",
  targetId: "same-workflow",
  state: "succeeded",
  input: "",
  createdAt: id === "first" ? 1 : 2,
  updatedAt: 2,
  attempt: 1,
  checkpoint: { steps: {}, values, completedRounds: 0 },
  definition: {
    id: "same-workflow",
    name: "Example",
    workspacePath: "C:/example",
    updatedAt: 0,
    nodes,
    edges: [],
  },
});
const key = (id: string) => JSON.stringify(["workflow-node", id]);

test("comparison uses each frozen run definition and persisted node output", () => {
  const first = run("first", [node("a", "Original name"), node("b", "Removed later")], {
    [key("a")]: result("succeeded", "original"),
    [key("b")]: result("skipped", ""),
  });
  const second = run("second", [node("a", "New name"), node("c", "Added later")], {
    [key("a")]: result("succeeded", "changed"),
    [key("c")]: result("failed", "failed output"),
  });
  const compared = compareWorkflowRuns(first, second);
  assert.deepEqual(
    compared.map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.equal(compared[0]?.first.label, "Original name");
  assert.equal(compared[0]?.second.label, "New name");
  assert.equal(compared[0]?.first.output, "original");
  assert.equal(compared[0]?.second.output, "changed");
  assert.equal(compared[0]?.changed, true);
  assert.equal(compared[1]?.second.state, "absent");
  assert.equal(compared[2]?.first.state, "absent");
  assert.equal(compared[2]?.second.state, "failed");
});

test("missing, malformed and long results are explicit", () => {
  const first = run("first", [node("a", "A"), node("b", "B")], {
    [key("a")]: "bad JSON",
  });
  const second = run("second", [node("a", "A"), node("b", "B")], {
    [key("a")]: result("succeeded", "x".repeat(5000)),
  });
  const compared = compareWorkflowRuns(first, second);
  assert.equal(compared[0]?.first.state, "unreadable");
  assert.equal(compared[0]?.second.output.length, 4000);
  assert.equal(compared[0]?.second.truncated, true);
  assert.equal(compared[1]?.first.state, "notRecorded");
  assert.equal(compared[1]?.second.state, "notRecorded");
  assert.equal(compared[1]?.changed, false);
});

test("runs from different workflows cannot be compared", () => {
  const first = run("first", [], {});
  const second = { ...run("second", [], {}), targetId: "other" };
  assert.throws(() => compareWorkflowRuns(first, second), /same workflow/);
});
