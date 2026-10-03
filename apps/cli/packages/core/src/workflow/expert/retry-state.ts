import { deriveWorkflowSessionLinks, type ExpertWorkflowRunSnapshot } from "@knorvia/contracts";
import { reconcileWorkflowSnapshotForResume, type WorkflowGraphNodeChange } from "../lifecycle.js";
import { phaseNodeId } from "./ids.js";
import { dedupeWorkflowNodeChanges, type ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRetryOptions } from "./types.js";

export function prepareSnapshotForRetry(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  options: Pick<ExpertWorkflowRetryOptions, "activityId" | "nodeId" | "phase">,
): {
  nodeChanges: WorkflowGraphNodeChange[];
  snapshot: ExpertWorkflowRunSnapshot;
} {
  const timestamp = ctx.timestamp();
  const activity = options.activityId
    ? snapshot.activities.find((entry) => entry.activityId === options.activityId)
    : undefined;
  const phase =
    options.phase ?? activity?.phase ?? snapshot.failure?.phase ?? snapshot.currentPhase;
  const nodeId = options.nodeId ?? activity?.nodeId ?? snapshot.failure?.nodeId;
  const scope = nodeId
    ? new Set([nodeId])
    : new Set(
        snapshot.graph.nodes
          .filter((node) => !phase || node.phase === phase || node.id === phaseNodeId(phase))
          .filter((node) => node.status === "failed" || node.status === "active")
          .map((node) => node.id),
      );
  const repair = reconcileWorkflowSnapshotForResume(snapshot, {
    nodeIds: scope.size > 0 ? scope : undefined,
    timestamp,
  });
  const nodeChanges = [...repair.nodeChanges];
  const resetNodes = repair.snapshot.graph.nodes.map((node) => {
    if (!scope.has(node.id) || (node.status !== "failed" && node.status !== "active")) {
      return node;
    }
    nodeChanges.push({ nodeId: node.id, phase: node.phase, status: "pending" });
    return { ...node, error: undefined, status: "pending" as const };
  });
  const resetPhases = repair.snapshot.phases.map((entry) => {
    if (
      phase &&
      entry.phase === phase &&
      (entry.status === "failed" || entry.status === "active")
    ) {
      return { ...entry, completedAt: undefined, error: undefined, status: "pending" as const };
    }
    return entry;
  });
  return {
    nodeChanges: dedupeWorkflowNodeChanges(nodeChanges),
    snapshot: {
      ...repair.snapshot,
      failure: undefined,
      graph: {
        collections: repair.snapshot.graph.collections,
        edges: repair.snapshot.graph.edges,
        nodes: resetNodes,
      },
      pauseReason: undefined,
      phases: resetPhases,
      recoveryActions: [],
      sessionLinks: deriveWorkflowSessionLinks({
        activities: repair.snapshot.activities,
        runId: repair.snapshot.runId,
      }),
      status: "running",
      updatedAt: timestamp,
    },
  };
}
