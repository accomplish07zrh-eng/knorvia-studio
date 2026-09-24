import assert from "node:assert/strict";
import test from "node:test";
import type { StudioRun, StudioTimeline } from "@knorvia/services";
import { createStudioGroupStore } from "../src/store/studioGroupStore.js";
import { createStudioWorkflowStore } from "../src/store/studioWorkflowStore.js";
import { newGroupConfig, type StudioGroup } from "../src/studio/groups/groupModel.js";
import { submitGroupDraft } from "../src/studio/groups/groupSubmission.js";
import { connectWorkflow } from "../src/studio/workflow/connection.js";
import { validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import { workflowNodeStates } from "../src/studio/workflow/workflowRuntimeState.js";
import {
  createWorkflowGraph,
  makeWorkflowNode,
  type StudioWorkflow,
} from "../src/studio/workflow/types.js";
import {
  decodeWorkflowFile,
  encodeWorkflowFile,
  WORKFLOW_FILE_LIMIT,
  workflowFileName,
} from "../src/studio/workflow/workflowFiles.js";

function storage() {
  let raw: string | null = null;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
}
function workflow(): StudioWorkflow {
  const graph = createWorkflowGraph("sequence");
  for (const node of graph.nodes) node.data.prompt = "Review the previous result.";
  return {
    id: "workflow",
    name: "Review",
    workspacePath: "D:/private/project",
    workspaceMode: "isolated",
    updatedAt: 1,
    ...graph,
  };
}
function run(overrides: Partial<StudioRun> = {}): StudioRun {
  return {
    id: "run",
    targetId: "workflow",
    kind: "group",
    state: "running",
    input: "",
    createdAt: 1,
    updatedAt: 1,
    attempt: 0,
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
    ...overrides,
  };
}
const group: StudioGroup = {
  ...newGroupConfig(),
  id: "group",
  name: "Group",
  workspacePath: "D:/project",
  draft: "Input",
  createdAt: 1,
  updatedAt: 1,
};

test("stop during a pending definition save prevents its late continuation from sending", async () => {
  let stopped = false;
  let text = group.draft;
  const calls: string[] = [];
  const sent = await submitGroupDraft({
    group,
    active: run(),
    currentDraft: () => text,
    clearDraft: () => {
      text = "";
    },
    canSubmit: () => !stopped,
    command: async (command) => {
      calls.push(command.type);
      stopped = true;
    },
  });
  assert.equal(sent, false);
  assert.equal(text, group.draft);
  assert.deepEqual(calls, ["save-group"]);
});

test("queued group tasks accept steering; stopping tasks never admit a new message", async () => {
  const calls: string[] = [];
  const submit = (active: StudioRun) =>
    submitGroupDraft({
      group,
      active,
      currentDraft: () => "Update",
      clearDraft: () => {},
      command: async (command) => {
        calls.push(command.type);
      },
    });
  assert.equal(await submit(run({ state: "queued", taskMode: true })), true);
  assert.deepEqual(calls, ["steer"]);
  calls.length = 0;
  assert.equal(await submit(run({ cancelRequested: true })), false);
  assert.deepEqual(calls, []);
});

test("a late group ACK cannot clear text typed after switching away and back", () => {
  const store = createStudioGroupStore(storage());
  store.getState().ensureDraft(group);
  store.getState().saveDraft(group.id, "First message");
  store.getState().saveDraft(group.id, "Newer unsent message");
  store.getState().clearDraftIfUnchanged(group.id, "First message");
  assert.equal(store.getState().groups[0]!.draft, "Newer unsent message");
  store.getState().clearDraftIfUnchanged(group.id, "Newer unsent message");
  assert.equal(store.getState().groups[0]!.draft, "");
});

test("clean server deletions disappear while dirty local work survives", () => {
  const store = createStudioWorkflowStore(storage());
  store.getState().hydrate();
  const first = workflow();
  const second = { ...workflow(), id: "dirty" };
  store.getState().syncDefinitions([first, second], 1);
  store.getState().rename(second.id, "Keep my edits");
  store.getState().select(first.id);
  store.getState().syncDefinitions([], 2);
  assert.deepEqual(
    store.getState().workflows.map((item) => item.id),
    [second.id],
  );
  assert.equal(store.getState().selectedId, null);
  assert.equal(store.getState().workflows[0]!.name, "Keep my edits");
});

test("acknowledged creates and deletes resist earlier service snapshots across reload", () => {
  const persistence = storage();
  let store = createStudioWorkflowStore(persistence);
  store.getState().hydrate();
  const value = workflow();
  store.getState().acceptDefinition(value, 10);
  store.getState().syncDefinitions([], 9);
  assert.equal(store.getState().workflows.length, 1);
  store.getState().syncDefinitions([value], 10);
  store.getState().remove(value.id, 11);
  store = createStudioWorkflowStore(persistence);
  store.getState().hydrate();
  store.getState().syncDefinitions([value], 10);
  assert.equal(store.getState().workflows.length, 0);
  store.getState().syncDefinitions([], 11);
  assert.equal(store.getState().workflows.length, 0);
});

test("run input stays scoped to its workflow across selection and reload", () => {
  const persistence = storage();
  const store = createStudioWorkflowStore(persistence);
  store.getState().hydrate();
  store.getState().syncDefinitions([workflow(), { ...workflow(), id: "other" }]);
  store.getState().saveInput("workflow", "Original run input");
  store.getState().select("other");
  store.getState().saveInput("other", "Separate run input");
  const restored = createStudioWorkflowStore(persistence);
  restored.getState().hydrate();
  assert.equal(restored.getState().inputDrafts.workflow, "Original run input");
  assert.equal(restored.getState().inputDrafts.other, "Separate run input");
  restored.getState().saveInput("other", "x".repeat(32001));
  assert.equal(restored.getState().inputDrafts.other, "Separate run input");
  restored.getState().remove("other");
  assert.equal(restored.getState().inputDrafts.other, undefined);
});

test("undo history cannot restore a graph from before a clean server replacement", () => {
  const store = createStudioWorkflowStore(storage());
  store.getState().hydrate();
  const value = workflow();
  store.getState().syncDefinitions([value], 1);
  store.getState().checkpoint(value.id);
  store.getState().syncDefinitions([{ ...value, name: "Changed on server", updatedAt: 2 }], 2);
  assert.equal(store.getState().history[value.id], undefined);
  store.getState().undo(value.id);
  assert.equal(store.getState().workflows[0]!.name, "Changed on server");
});

test("workflow checking rejects invalid conditions and references before sending", () => {
  const value = workflow();
  value.nodes[1]!.data.prompt = "Read {{nonexistent}}";
  assert.ok(validateWorkflowGraph(value).some((issue) => issue.code === "invalidReference"));
  const branch = { ...workflow(), ...createWorkflowGraph("branch") };
  for (const node of branch.nodes) node.data.prompt = "Inspect.";
  branch.nodes[1]!.data.condition = "arbitrary.javascript()";
  assert.ok(validateWorkflowGraph(branch).some((issue) => issue.code === "invalidCondition"));
  branch.nodes[1]!.data.condition = 'input contains "approved"';
  assert.deepEqual(validateWorkflowGraph(branch), []);
});

test("a full graph permits replacing a single output but rejects a new parallel branch", () => {
  const value = workflow();
  const [start, agent, approval] = value.nodes;
  value.edges = Array.from({ length: 800 }, (_, index) => ({
    id: `edge-${index}`,
    source: index === 0 ? start!.id : agent!.id,
    target: approval!.id,
  }));
  const replaced = connectWorkflow(value, {
    source: start!.id,
    target: agent!.id,
    sourceHandle: null,
    targetHandle: null,
  });
  assert.equal(replaced.length, 800);
  assert.equal(replaced.at(-1)!.target, agent!.id);
  const fork = makeWorkflowNode("parallel", { x: 0, y: 0 });
  value.nodes.push(fork);
  assert.equal(
    connectWorkflow(value, {
      source: fork.id,
      target: agent!.id,
      sourceHandle: null,
      targetHandle: null,
    }),
    value.edges,
  );
});

test("non-CLI nodes retain failed, declined and cancelled results in canvas badges", () => {
  const value = workflow();
  const node = value.nodes.find((item) => item.data.kind === "approval")!;
  for (const status of ["failed", "denied", "cancelled", "interrupted"]) {
    const current = run({ kind: "workflow", state: "failed" });
    current.checkpoint.values[JSON.stringify(["workflow-node", node.id])] = JSON.stringify({
      status,
    });
    const timeline: StudioTimeline = {
      revision: 1,
      messages: [],
      interactions: [],
      runs: [current],
    };
    assert.equal(workflowNodeStates(value, timeline).get(node.id), status);
  }
});

test("workflow files round-trip an independent definition and rewrite whitespace references", () => {
  const source = workflow();
  source.nodes[1]!.data.prompt = `Read {{ ${source.nodes[0]!.id} }}`;
  source.nodes[0]!.data.executionState = "running";
  source.nodes[0]!.data.apiKey = "must-not-export";
  const original = structuredClone(source);
  const text = encodeWorkflowFile(source);
  assert.ok(!text.includes("D:/private/project"));
  assert.ok(!text.includes("executionState"));
  assert.ok(!text.includes("must-not-export"));
  const imported = decodeWorkflowFile(text);
  assert.notEqual(imported.workflow.id, source.id);
  assert.equal(imported.workflow.workspacePath, "");
  assert.equal(imported.workflow.workspaceMode, "isolated");
  assert.equal(
    imported.workflow.nodes[1]!.data.prompt,
    `Read {{${imported.workflow.nodes[0]!.id}}}`,
  );
  assert.deepEqual(imported.issues, []);
  assert.deepEqual(source, original);
});

test("incomplete workflow files are editable drafts, never implicitly runnable", () => {
  const result = decodeWorkflowFile(
    encodeWorkflowFile({ ...workflow(), ...createWorkflowGraph("sequence") }),
  );
  assert.ok(result.issues.some((issue) => issue.code === "promptRequired"));
  assert.ok(result.issues.some((issue) => issue.code === "approvalRequired"));
});

test("file import rejects unknown versions, unsafe identities, excess graph sizes and extra fields", () => {
  const base = JSON.parse(encodeWorkflowFile(workflow()));
  const invalid = [
    { ...base, version: 2 },
    { ...base, unexpected: true },
    { ...base, workflow: { ...base.workflow, workspacePath: "D:/other-user" } },
    {
      ...base,
      workflow: {
        ...base.workflow,
        nodes: [{ ...base.workflow.nodes[0], position: { x: 1e300, y: 0 } }],
      },
    },
    {
      ...base,
      workflow: { ...base.workflow, nodes: [{ ...base.workflow.nodes[0], id: "__proto__" }] },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        nodes: Array.from({ length: 201 }, (_, index) => ({
          ...base.workflow.nodes[0],
          id: `n${index}`,
        })),
      },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        edges: [{ ...base.workflow.edges[0], targetHandle: "hidden-port" }],
      },
    },
  ];
  for (const candidate of invalid)
    assert.throws(() => decodeWorkflowFile(JSON.stringify(candidate)));
  assert.throws(() => decodeWorkflowFile("{"));
  assert.throws(() => decodeWorkflowFile(" ".repeat(WORKFLOW_FILE_LIMIT + 1)), /fileTooLarge/);
});

test("file names do not form Windows device names or nested paths", () => {
  assert.equal(workflowFileName("CON"), "workflow-CON.knorvia-workflow.json");
  assert.equal(workflowFileName("a/b:c"), "a_b_c.knorvia-workflow.json");
  assert.equal(workflowFileName("..."), "workflow.knorvia-workflow.json");
});
