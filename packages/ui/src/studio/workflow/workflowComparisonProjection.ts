import type { StudioRun, StudioWorkflowDefinition } from "@knorvia/services";

export interface WorkflowNodeComparisonSide {
  label: string;
  state: string;
  output: string;
  truncated: boolean;
}
export interface WorkflowNodeComparison {
  id: string;
  first: WorkflowNodeComparisonSide;
  second: WorkflowNodeComparisonSide;
  changed: boolean;
}

const OUTPUT_LIMIT = 4000;
const statuses = new Set(["succeeded", "skipped", "failed", "cancelled", "interrupted"]);
const valueKey = (nodeId: string) => JSON.stringify(["workflow-node", nodeId]);

function frozenNodes(run: StudioRun) {
  if (run.kind !== "workflow" || !run.definition || !("nodes" in run.definition)) return [];
  return (run.definition as StudioWorkflowDefinition).nodes;
}

function side(run: StudioRun, nodeId: string): WorkflowNodeComparisonSide {
  const node = frozenNodes(run).find((item) => item.id === nodeId);
  if (!node) return { label: nodeId, state: "absent", output: "", truncated: false };
  const raw = run.checkpoint.values[valueKey(nodeId)];
  if (raw === undefined)
    return { label: node.data.label || node.data.kind, state: "notRecorded", output: "", truncated: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid result");
    const value = parsed as Record<string, unknown>;
    if (!statuses.has(String(value.status)) || typeof value.text !== "string")
      throw new Error("Invalid result");
    const full = value.text || (typeof value.error === "string" ? value.error : "");
    return {
      label: node.data.label || node.data.kind,
      state: String(value.status),
      output: full.slice(0, OUTPUT_LIMIT),
      truncated: full.length > OUTPUT_LIMIT,
    };
  } catch {
    return { label: node.data.label || node.data.kind, state: "unreadable", output: "", truncated: false };
  }
}

/** Compare only the two persisted snapshots; never use today's editable canvas. */
export function compareWorkflowRuns(first: StudioRun, second: StudioRun): WorkflowNodeComparison[] {
  if (first.kind !== "workflow" || second.kind !== "workflow" || first.targetId !== second.targetId)
    throw new Error("Runs must belong to the same workflow.");
  const ids = [...new Set([...frozenNodes(first).map((node) => node.id), ...frozenNodes(second).map((node) => node.id)])];
  return ids.map((id) => {
    const before = side(first, id);
    const after = side(second, id);
    return {
      id,
      first: before,
      second: after,
      changed: before.state !== after.state || before.output !== after.output || before.truncated !== after.truncated,
    };
  });
}
