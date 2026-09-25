import assert from "node:assert/strict";
import test from "node:test";
import { validateStudioWorkflow } from "@knorvia/services";
import { validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import { createWorkflowGraph, type StudioWorkflow } from "../src/studio/workflow/types.js";
import {
  decodeWorkflowFile,
  encodeWorkflowFile,
  WORKFLOW_FILE_VERSION,
} from "../src/studio/workflow/workflowFiles.js";
import { workflowDefinition } from "../src/studio/workflow/workflowDrafts.js";

function workflow(overrides: Partial<StudioWorkflow> = {}): StudioWorkflow {
  const graph = createWorkflowGraph("sequence");
  for (const node of graph.nodes) node.data.prompt = "Review the previous result.";
  return {
    id: "workflow",
    name: "Review",
    workspacePath: "D:/private/project",
    workspaceMode: "isolated",
    updatedAt: 1,
    ...graph,
    ...overrides,
  };
}

test("workflow files round-trip parameters, declared outputs and execution requirements", () => {
  const source = workflow();
  const agent = source.nodes.find((node) => node.data.kind === "agent")!;
  agent.data.params = [
    { name: "topic", type: "text", default: "release", required: true, label: "主题" },
    { name: "count", type: "number" },
  ];
  agent.data.outputNames = ["design", "notes"];
  agent.data.permission = "read-only";
  agent.data.prompt = "Read {{param.topic}} and {{ref.design}}";
  source.nodes[0]!.data.outputNames = ["design"];
  const original = structuredClone(source);
  const text = encodeWorkflowFile(source);
  // 未声明的字段不得凭空写入文件。
  assert.ok(!text.includes("executionState"));
  const imported = decodeWorkflowFile(text, "D:/project");
  const importedAgent = imported.workflow.nodes.find((node) => node.data.kind === "agent")!;
  assert.deepEqual(importedAgent.data.params, agent.data.params);
  assert.deepEqual(importedAgent.data.outputNames, ["design", "notes"]);
  assert.equal(importedAgent.data.permission, "read-only");
  // 节点 id 被重写，但参数与输出声明是名字而不是 id，引用不会悬空。
  assert.equal(importedAgent.data.prompt, "Read {{param.topic}} and {{ref.design}}");
  assert.deepEqual(imported.issues, []);
  assert.deepEqual(source, original);
  const approvalCopy = imported.workflow.nodes.find((node) => node.data.kind === "approval")!;
  assert.equal(approvalCopy.data.params, undefined);
  assert.equal(approvalCopy.data.permission, undefined);
});

test("imported parameter schemas still pass the shared definition validation", () => {
  const source = workflow();
  const agent = source.nodes.find((node) => node.data.kind === "agent")!;
  agent.data.params = [{ name: "topic", type: "boolean", default: "false" }];
  const imported = decodeWorkflowFile(encodeWorkflowFile(source), "D:/project");
  assert.deepEqual(imported.issues, []);
  const definition = workflowDefinition(imported.workflow);
  assert.deepEqual(validateStudioWorkflow(definition), []);
  assert.deepEqual(validateWorkflowGraph(imported.workflow), []);
});

test("file import rejects malformed parameter and output declarations", () => {
  const base = JSON.parse(encodeWorkflowFile(workflow()));
  const invalid = [
    { params: [{ name: "Topic", type: "text" }] },
    { params: [{ name: "topic", type: "date" }] },
    { params: [{ name: "topic", type: "text", extra: true }] },
    {
      params: [
        { name: "topic", type: "text" },
        { name: "topic", type: "text" },
      ],
    },
    { params: [{ name: "topic", type: "text", required: "yes" }] },
    { outputNames: ["Design"] },
    { outputNames: ["design", "design"] },
    { permission: "sudo" },
  ];
  for (const data of invalid) {
    const candidate = structuredClone(base);
    candidate.workflow.nodes[1].data = {
      ...candidate.workflow.nodes[1].data,
      ...data,
    };
    assert.throws(
      () => decodeWorkflowFile(JSON.stringify(candidate)),
      /fileInvalid/,
      JSON.stringify(data),
    );
  }
});

test("older envelopes stay importable and unknown ones are still rejected", () => {
  const base = JSON.parse(encodeWorkflowFile(workflow()));
  for (const accepted of [1, 2, WORKFLOW_FILE_VERSION])
    assert.equal(
      decodeWorkflowFile(JSON.stringify({ ...base, version: accepted })).workflow.nodes.length,
      base.workflow.nodes.length,
    );
  assert.throws(
    () => decodeWorkflowFile(JSON.stringify({ ...base, version: WORKFLOW_FILE_VERSION + 1 })),
    /fileVersion/,
  );
});
