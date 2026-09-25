import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun } from "@knorvia/services";
import { compareWorkflowRuns } from "../src/studio/workflow/workflowComparisonProjection.js";
import { makeWorkflowNode } from "../src/studio/workflow/types.js";
import {
  decodeWorkflowFile,
  encodeWorkflowFile,
  WorkflowFileError,
  WORKFLOW_FILE_VERSION,
} from "../src/studio/workflow/workflowFiles.js";

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

test("import and export round-trip keeps the contract version key instead of dropping it", () => {
  const start = makeWorkflowNode("start", { x: 0, y: 0 }, "Start", "start");
  const agent = makeWorkflowNode("agent", { x: 200, y: 0 }, "Work", "agent");
  agent.data.version = 1;
  const creation = makeWorkflowNode("creation", { x: 400, y: 0 }, "Render", "render");
  creation.data.creationModelId = "image-model";
  const end = makeWorkflowNode("end", { x: 600, y: 0 }, "End", "end");
  const workflow = {
    id: "flow",
    name: "Round trip",
    workspacePath: "C:/example",
    updatedAt: 1,
    nodes: [start, agent, creation, end],
    edges: [
      { id: "e0", source: "start", target: "agent" },
      { id: "e1", source: "agent", target: "render" },
      { id: "e2", source: "render", target: "end" },
    ],
  };
  const encoded = encodeWorkflowFile(workflow);
  assert.equal(JSON.parse(encoded).version, WORKFLOW_FILE_VERSION);
  const decoded = decodeWorkflowFile(encoded, "C:/example");
  const imported = decoded.workflow.nodes.find((node) => node.data.label === "Work");
  assert.equal(imported?.data.version, 1, "version must survive the round trip");
  assert.equal(imported?.data.kind, "agent");
  assert.equal(
    decoded.workflow.nodes.find((node) => node.data.label === "Render")?.data.creationModelId,
    "image-model",
  );
  // 导入后再次导出仍然保留该键（往返可重复）。
  assert.equal(
    JSON.parse(encodeWorkflowFile(decoded.workflow)).workflow.nodes.find(
      (node: { data: { label: string } }) => node.data.label === "Work",
    ).data.version,
    1,
  );
  // 未知键仍然按闭合白名单拒绝，不做任意透传。
  const tampered = JSON.parse(encoded);
  tampered.workflow.nodes[1].data.unknownKey = "nope";
  assert.throws(
    () => decodeWorkflowFile(JSON.stringify(tampered)),
    (error: unknown) => error instanceof WorkflowFileError && error.code === "fileInvalid",
  );
  // 版本 1 的旧信封继续可导入。
  const legacy = JSON.parse(encoded);
  legacy.version = 1;
  delete legacy.workflow.nodes[1].data.version;
  assert.equal(decodeWorkflowFile(JSON.stringify(legacy)).workflow.nodes.length, 4);
  // 未知信封版本明确拒绝。
  const newer = JSON.parse(encoded);
  newer.version = 99;
  assert.throws(
    () => decodeWorkflowFile(JSON.stringify(newer)),
    (error: unknown) => error instanceof WorkflowFileError && error.code === "fileVersion",
  );
});
