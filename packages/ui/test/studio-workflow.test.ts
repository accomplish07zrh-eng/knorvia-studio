import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioWorkflowStore,
  STUDIO_WORKFLOW_STORAGE_KEY,
} from "../src/store/studioWorkflowStore.js";
import { connectWorkflow } from "../src/studio/workflow/connection.js";
import { isStudioWorkflow, validateWorkflowGraph } from "../src/studio/workflow/graph.js";
import {
  createWorkflowGraph,
  makeWorkflowNode,
  type WorkflowGraph,
} from "../src/studio/workflow/types.js";
import { workflowEnUS, workflowZhCN } from "../src/studio/workflow/messages.js";

function ready(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        prompt: "Review the supplied document.",
        condition: "output.approved == true",
      },
    })),
  };
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  let writes = 0;
  return {
    getItem: (_key: string) => value,
    setItem: (_key: string, next: string) => {
      writes++;
      value = next;
    },
    read: () => value,
    writes: () => writes,
  };
}

test("sequential, parallel/join and conditional definitions validate once instructions are complete", () => {
  for (const template of ["sequence", "parallel", "branch"] as const) {
    assert.deepEqual(validateWorkflowGraph(ready(createWorkflowGraph(template))), [], template);
  }
  assert.ok(
    validateWorkflowGraph(createWorkflowGraph("sequence")).some(
      (issue) => issue.code === "promptRequired",
    ),
  );
  assert.ok(
    validateWorkflowGraph(createWorkflowGraph("sequence")).some(
      (issue) => issue.code === "approvalRequired",
    ),
  );
});

test("validation distinguishes disconnected nodes, cycles and missing condition ports", () => {
  const graph = ready(createWorkflowGraph("branch"));
  const condition = graph.nodes.find((node) => node.data.kind === "condition")!;
  graph.edges = graph.edges.filter((edge) => edge.sourceHandle !== "no");
  graph.nodes.push(makeWorkflowNode("agent", { x: 0, y: 0 }, "Unconnected", "stray"));
  const agent = graph.nodes.find((node) => node.data.kind === "agent")!;
  graph.edges.push({ id: "cycle", source: agent.id, target: condition.id });
  const issues = validateWorkflowGraph(graph);
  assert.ok(
    issues.some((issue) => issue.code === "conditionBranches" && issue.nodeId === condition.id),
  );
  assert.ok(issues.some((issue) => issue.code === "cycle"));
  assert.ok(issues.some((issue) => issue.code === "unreachable" && issue.nodeId === "stray"));
  assert.ok(issues.some((issue) => issue.code === "noEndPath" && issue.nodeId === "stray"));
});

test("ports enforce one next step and preserve the other conditional branch", () => {
  const graph = createWorkflowGraph("branch");
  const condition = graph.nodes.find((node) => node.data.kind === "condition")!;
  const end = graph.nodes.find((node) => node.data.kind === "end")!;
  const noBranch = graph.edges.find((edge) => edge.sourceHandle === "no")!;
  const changed = connectWorkflow(graph, {
    source: condition.id,
    target: end.id,
    sourceHandle: "yes",
    targetHandle: null,
  });
  assert.equal(changed.filter((edge) => edge.source === condition.id).length, 2);
  assert.ok(changed.some((edge) => edge.id === noBranch.id));
  assert.equal(changed.find((edge) => edge.sourceHandle === "yes")?.target, end.id);
  assert.equal(
    connectWorkflow(graph, {
      source: end.id,
      target: condition.id,
      sourceHandle: null,
      targetHandle: null,
    }),
    graph.edges,
  );
  assert.equal(
    connectWorkflow(graph, {
      source: condition.id,
      target: condition.id,
      sourceHandle: "yes",
      targetHandle: null,
    }),
    graph.edges,
  );
});

test("parallel port accepts several distinct targets and rejects duplicates", () => {
  const graph = createWorkflowGraph("parallel");
  const fork = graph.nodes.find((node) => node.data.kind === "parallel")!;
  const extra = makeWorkflowNode("agent", { x: 20, y: 20 });
  graph.nodes.push(extra);
  const connection = { source: fork.id, target: extra.id, sourceHandle: null, targetHandle: null };
  const edges = connectWorkflow(graph, connection);
  assert.equal(edges.filter((edge) => edge.source === fork.id).length, 3);
  assert.equal(connectWorkflow({ ...graph, edges }, connection), edges);
});

test("node deletion, undo/redo and reload keep a single consistent graph", () => {
  const storage = memoryStorage();
  const store = createStudioWorkflowStore(storage);
  store.getState().hydrate();
  const id = store.getState().createWorkflow("Review", "sequence", "D:/project")!;
  const original = store.getState().workflows[0]!;
  const agentId = original.nodes.find((node) => node.data.kind === "agent")!.id;
  const removedEdges = original.edges
    .filter((edge) => edge.source === agentId || edge.target === agentId)
    .map((edge) => edge.id);
  store.getState().removeNodes(id, [agentId]);
  store.getState().removeEdges(id, removedEdges);
  assert.equal(store.getState().workflows[0]!.nodes.length, 3);
  assert.equal(store.getState().history[id]!.past.length, 1);
  store.getState().undo(id);
  assert.equal(store.getState().workflows[0]!.nodes.length, 4);
  assert.equal(store.getState().workflows[0]!.edges.length, 3);
  store.getState().redo(id);
  assert.equal(store.getState().workflows[0]!.nodes.length, 3);
  const restored = createStudioWorkflowStore(storage);
  restored.getState().hydrate();
  assert.equal(restored.getState().selectedId, id);
  assert.deepEqual(restored.getState().workflows, store.getState().workflows);
  assert.equal(restored.getState().workflows[0]!.workspacePath, "D:/project");
});

test("drag gestures avoid writes until committed and create one undo checkpoint", () => {
  const storage = memoryStorage();
  const store = createStudioWorkflowStore(storage);
  store.getState().hydrate();
  const id = store.getState().createWorkflow("Drag", "sequence")!;
  const original = store.getState().workflows[0]!;
  const writes = storage.writes();
  store.getState().checkpoint(id);
  for (let x = 0; x < 30; x++)
    store.getState().updateGraph(
      id,
      {
        ...original,
        nodes: original.nodes.map((node, index) =>
          index === 0 ? { ...node, position: { x, y: 20 } } : node,
        ),
      },
      { checkpoint: false, persist: false },
    );
  assert.equal(storage.writes(), writes);
  assert.equal(store.getState().history[id]!.past.length, 1);
  store.getState().save();
  assert.equal(storage.writes(), writes + 1);
  store.getState().undo(id);
  assert.deepEqual(store.getState().workflows[0]!.nodes[0]!.position, original.nodes[0]!.position);
});

test("duplicates remap every node and edge while leaving the original unchanged", () => {
  const storage = memoryStorage();
  const store = createStudioWorkflowStore(storage);
  store.getState().hydrate();
  const id = store.getState().createWorkflow("Review", "parallel")!;
  const original = structuredClone(store.getState().workflows[0]!);
  const duplicateId = store.getState().duplicate(id, "Review copy");
  const copy = store.getState().workflows.find((item) => item.id === duplicateId)!;
  assert.deepEqual(store.getState().workflows[0], original);
  assert.equal(copy.nodes.length, original.nodes.length);
  assert.ok(copy.nodes.every((node) => !original.nodes.some((item) => item.id === node.id)));
  const nodeIds = new Set(copy.nodes.map((node) => node.id));
  assert.ok(copy.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
  assert.ok(isStudioWorkflow(copy));
});

test("corrupt and unsupported records are never overwritten by empty or new drafts", () => {
  for (const raw of [
    "",
    "{broken",
    JSON.stringify({ version: 2, workflows: [] }),
    JSON.stringify({ version: 1, workflows: [{ id: "unsafe" }], selectedId: null }),
  ]) {
    const storage = memoryStorage(raw);
    const store = createStudioWorkflowStore(storage);
    store.getState().hydrate();
    assert.equal(store.getState().storageProblem, "corrupt");
    assert.equal(store.getState().createWorkflow("New", "blank"), null);
    store.getState().select(null);
    store.getState().save();
    assert.equal(storage.read(), raw);
    assert.equal(storage.writes(), 0);
  }
});

test("read failures block new drafts until reading succeeds; write failures retain edited data", () => {
  let failRead = true;
  let failWrite = true;
  const memory = memoryStorage();
  const storage = {
    getItem(key: string) {
      if (failRead) throw new Error("read denied");
      return memory.getItem(key);
    },
    setItem(key: string, value: string) {
      if (failWrite) throw new Error("quota");
      memory.setItem(key, value);
    },
  };
  const store = createStudioWorkflowStore(storage);
  store.getState().hydrate();
  assert.equal(store.getState().createWorkflow("Blocked", "blank"), null);
  store.getState().save();
  assert.equal(memory.writes(), 0);
  failRead = false;
  store.getState().save();
  assert.equal(store.getState().hydrated, true);
  const id = store.getState().createWorkflow("Retained", "sequence")!;
  assert.ok(id);
  assert.equal(store.getState().storageProblem, "unavailable");
  assert.equal(store.getState().workflows[0]!.name, "Retained");
  failWrite = false;
  store.getState().save();
  assert.equal(store.getState().storageProblem, null);
  assert.equal(JSON.parse(memory.getItem(STUDIO_WORKFLOW_STORAGE_KEY)!).workflows[0].id, id);
});

test("stored node state and locale catalogs preserve the supported contract", () => {
  const graph = ready(createWorkflowGraph("sequence"));
  const workflow = {
    ...graph,
    id: "stored",
    name: "Draft",
    workspacePath: "",
    updatedAt: Date.now(),
  };
  assert.ok(isStudioWorkflow(workflow));
  assert.equal(
    isStudioWorkflow({
      ...workflow,
      nodes: [{ ...workflow.nodes[0], data: { ...workflow.nodes[0]!.data, kernel: "unknown" } }],
    }),
    false,
  );
  assert.equal(
    isStudioWorkflow({
      ...workflow,
      nodes: [{ ...workflow.nodes[0], position: { x: Number.POSITIVE_INFINITY, y: 0 } }],
    }),
    false,
  );
  assert.deepEqual(Object.keys(workflowZhCN).sort(), Object.keys(workflowEnUS).sort());
});
