import assert from "node:assert/strict";
import test from "node:test";
import type { StudioRun, StudioTimeline } from "@knorvia/services";
import { createStudioGroupStore } from "../src/store/studioGroupStore.js";
import { createStudioWorkflowStore } from "../src/store/studioWorkflowStore.js";
import { newGroupConfig, type StudioGroup } from "../src/studio/groups/groupModel.js";
import { activeGroupRun, submitGroupDraft } from "../src/studio/groups/groupSubmission.js";
import {
  workflowDefinition,
  workflowDraft,
  duplicateWorkflow,
  workflowFitsRuntime,
} from "../src/studio/workflow/workflowDrafts.js";
import { workflowNodeStates } from "../src/studio/workflow/workflowRuntimeState.js";
import {
  createWorkflowGraph,
  makeWorkflowNode,
  type StudioWorkflow,
} from "../src/studio/workflow/types.js";

function storage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, text: string) => {
      value = text;
    },
  };
}
function draft(): StudioWorkflow {
  return {
    id: "workflow",
    name: "Workflow",
    workspacePath: "D:/project",
    updatedAt: 1,
    ...createWorkflowGraph("sequence"),
  };
}
function run(overrides: Partial<StudioRun> = {}): StudioRun {
  return {
    id: "run",
    kind: "workflow",
    targetId: "workflow",
    state: "running",
    input: "",
    createdAt: 1,
    updatedAt: 1,
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
    attempt: 0,
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

test("backend group hydration preserves unsent text and deleted import receipts survive reload", () => {
  const persistence = storage();
  const store = createStudioGroupStore(persistence);
  store.getState().ensureDraft(group);
  store.getState().saveDraft(group.id, "Latest unsent message");
  store.getState().ensureDraft({ ...group, name: "Server name", updatedAt: 2 });
  assert.equal(store.getState().groups[0]?.draft, "Latest unsent message");
  assert.equal(store.getState().groups[0]?.name, "Server name");
  store.getState().markImported(group.id);
  store.getState().deleteGroup(group.id);
  const reloaded = createStudioGroupStore(persistence).getState();
  assert.equal(reloaded.groups.length, 0);
  assert.deepEqual(reloaded.importedIds, [group.id]);
});

test("failed group send preserves draft and cannot send before definition acknowledgement", async () => {
  let input = "My unsent message";
  const calls: string[] = [];
  const submit = () =>
    submitGroupDraft({
      group,
      currentDraft: () => input,
      clearDraft: () => {
        input = "";
      },
      command: async (command) => {
        calls.push(command.type);
        throw new Error("Connection lost");
      },
    });
  await assert.rejects(submit(), /Connection lost/);
  assert.equal(input, "My unsent message");
  assert.deepEqual(calls, ["save-group"]);
  calls.length = 0;
  await assert.rejects(
    submitGroupDraft({
      group,
      currentDraft: () => input,
      clearDraft: () => {
        input = "";
      },
      command: async (command) => {
        calls.push(command.type);
        if (command.type === "send") throw new Error("Reply lost");
      },
    }),
  );
  assert.deepEqual(calls, ["save-group", "send"]);
  assert.equal(input, "My unsent message");
});

test("accepted send clears only the submitted draft and active task input uses steering", async () => {
  let input = "Original message";
  const calls: string[] = [];
  await submitGroupDraft({
    group,
    currentDraft: () => input,
    clearDraft: () => {
      input = "";
    },
    command: async (command) => {
      calls.push(command.type);
      if (command.type === "send") input = "Typed while sending";
    },
  });
  assert.equal(input, "Typed while sending");
  calls.length = 0;
  await submitGroupDraft({
    group,
    active: run({ kind: "group", taskMode: true }),
    currentDraft: () => input,
    clearDraft: () => {
      input = "";
    },
    command: async (command) => {
      calls.push(command.type);
    },
  });
  assert.deepEqual(calls, ["steer"]);
  assert.equal(input, "");
});

test("newer queued input does not hide the running task from stop and steering controls", () => {
  const active = run({ id: "active", kind: "group", taskMode: true });
  const queued = run({ id: "queued", kind: "group", state: "queued", createdAt: 2 });
  assert.equal(activeGroupRun([queued, active])?.id, active.id);
});

test("workflow backend refresh and save acknowledgements never overwrite newer unsaved edits", () => {
  const persistence = storage();
  const store = createStudioWorkflowStore(persistence);
  store.getState().hydrate();
  const original = draft();
  store.getState().syncDefinitions([original]);
  const changed = {
    nodes: original.nodes.map((node) => ({
      ...node,
      data: { ...node.data, prompt: "Unsaved instruction" },
    })),
    edges: original.edges,
  };
  store.getState().updateGraph(original.id, changed);
  store.getState().syncDefinitions([{ ...original, name: "Server name", updatedAt: 2 }]);
  assert.equal(store.getState().workflows[0]?.nodes[0]?.data.prompt, "Unsaved instruction");
  const submitted = store.getState().workflows[0]!;
  store.getState().updateGraph(original.id, {
    ...changed,
    nodes: changed.nodes.map((node) => ({
      ...node,
      data: { ...node.data, prompt: "Typed during save" },
    })),
  });
  store.getState().acceptDefinition(submitted);
  assert.equal(store.getState().workflows[0]?.nodes[0]?.data.prompt, "Typed during save");
  store.getState().markImported(original.id);
  store.getState().remove(original.id);
  const reloaded = createStudioWorkflowStore(persistence);
  reloaded.getState().hydrate();
  assert.deepEqual(reloaded.getState().importedIds, [original.id]);
  assert.equal(reloaded.getState().workflows.length, 0);
});

test("stale backend snapshot cannot roll back an acknowledged workflow", () => {
  const store = createStudioWorkflowStore(storage());
  store.getState().hydrate();
  const old = draft();
  const saved = { ...old, name: "New name", updatedAt: 10 };
  store.getState().acceptDefinition(saved);
  store.getState().syncDefinitions([old]);
  assert.equal(store.getState().workflows[0]?.name, "New name");
});

test("workflow contract excludes runtime badges and limits match backend admission", () => {
  const value = draft();
  value.nodes[0]!.data.executionState = "running";
  assert.equal(workflowDefinition(value).nodes[0]!.data.executionState, undefined);
  assert.equal(workflowDraft(workflowDefinition(value)).workspacePath, value.workspacePath);
  assert.equal(workflowFitsRuntime({ ...value, name: "n".repeat(101) }), false);
  assert.equal(
    workflowFitsRuntime({
      ...value,
      nodes: Array.from({ length: 201 }, () => makeWorkflowNode("agent", { x: 0, y: 0 })),
    }),
    false,
  );
  assert.equal(
    workflowFitsRuntime({
      ...value,
      edges: Array.from({ length: 801 }, () => ({ id: "e", source: "a", target: "b" })),
    }),
    false,
  );
});

test("oversized legacy workflow stays readable and can be reduced without truncation", () => {
  const oversized = {
    ...draft(),
    name: "n".repeat(120),
    nodes: Array.from({ length: 202 }, () => makeWorkflowNode("agent", { x: 0, y: 0 })),
    edges: [],
  };
  const persistence = storage();
  persistence.setItem(
    "unused",
    JSON.stringify({ version: 1, workflows: [oversized], selectedId: oversized.id }),
  );
  const store = createStudioWorkflowStore(persistence);
  store.getState().hydrate();
  assert.equal(store.getState().storageProblem, null);
  assert.equal(store.getState().workflows[0]?.nodes.length, 202);
  store.getState().removeNodes(oversized.id, [oversized.nodes[0]!.id]);
  assert.equal(store.getState().workflows[0]?.nodes.length, 201);
  store.getState().removeNodes(oversized.id, [oversized.nodes[1]!.id]);
  store.getState().rename(oversized.id, "Repaired draft");
  assert.equal(workflowFitsRuntime(store.getState().workflows[0]!), true);
});

test("duplicating a workflow remaps references as well as edges", () => {
  const value = draft();
  const source = value.nodes[0]!;
  value.nodes[1]!.data.prompt = `Review {{${source.id}}}`;
  value.nodes[1]!.data.condition = `{{${source.id}}} equals "approved"`;
  const copy = duplicateWorkflow(value, "Copy");
  assert.equal(copy.nodes[1]!.data.prompt, `Review {{${copy.nodes[0]!.id}}}`);
  assert.ok(copy.nodes[1]!.data.condition.includes(copy.nodes[0]!.id));
  assert.notEqual(copy.id, value.id);
});

test("workflow node states use persisted turns and never revive running nodes after interruption", () => {
  const value = draft();
  const agent = value.nodes[1]!;
  const approval = value.nodes[2]!;
  const current = run();
  const timeline: StudioTimeline = {
    revision: 1,
    messages: [],
    interactions: [],
    runs: [current],
    turns: [
      {
        id: "turn",
        runId: current.id,
        stepId: `workflow:${agent.id}:attempt:0`,
        state: "running",
        attempt: 0,
      },
    ],
  };
  assert.equal(workflowNodeStates(value, timeline).get(agent.id), "running");
  timeline.runs.unshift(run({ id: "queued", state: "queued", createdAt: 2 }));
  assert.equal(workflowNodeStates(value, timeline).get(agent.id), "running");
  timeline.runs.shift();
  current.state = "interrupted";
  assert.equal(workflowNodeStates(value, timeline).has(agent.id), false);
  current.state = "waiting";
  timeline.interactions.push({
    id: "confirm",
    runId: current.id,
    turnId: `${current.id}:attempt:${current.attempt}:confirm:workflow:${approval.id}:approval`,
    kind: "approval",
    status: "pending",
    title: "Review",
  });
  assert.equal(workflowNodeStates(value, timeline).get(approval.id), "waiting");
  current.checkpoint.values[JSON.stringify(["workflow-node", value.nodes[0]!.id])] =
    '{"status":"skipped"}';
  assert.equal(workflowNodeStates(value, timeline).get(value.nodes[0]!.id), "skipped");
});
