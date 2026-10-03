import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import {
  collectionFrontier,
  collectionNodeIdsForGraph,
  graphCollections,
  isCollectionInPhase,
  nodeById,
  updateGraphCollection,
} from "./graph.js";
import type { SchedulerCollection, WorkflowGraphSchedulerRunOptions } from "./types.js";

export type Admission = { snapshot: WorkflowRunSnapshot } & (
  | { action: "skip" }
  | { action: "exhaust"; collection: SchedulerCollection; reason: string }
  | { action: "attempt"; collection: SchedulerCollection; unseen: string[] }
);
// Admission is synchronous; only exhaustion and a real attempt create sweep await gates.
export function admitCollection(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  executableNodeIds: Set<string>,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): Admission {
  if (
    !collection.explorable ||
    !isCollectionInPhase(collection, snapshot.graph, executableNodeIds, options.phase)
  )
    return { action: "skip", snapshot };
  const members = collectionNodeIdsForGraph(collection, snapshot.graph);
  const frontier = collectionFrontier(snapshot.graph, collection);
  const completed: string[] = [];
  for (const id of members) {
    if (nodeById(snapshot.graph, id)?.status === "completed") completed.push(id);
  }
  const unseen: string[] = [];
  for (const id of completed) {
    if (!(collection.analyzedNodeIds ?? []).includes(id)) unseen.push(id);
  }
  if (unseen.length) {
    snapshot = updateGraphCollection(
      snapshot,
      collection.collectionId,
      {
        lastCompletionAt: runtime.eventLog.timestamp(),
      },
      runtime.eventLog.timestamp(),
    );
  }
  const latest =
    graphCollections(snapshot.graph).find(
      (item) => item.collectionId === collection.collectionId,
    ) ?? collection;
  if (latest.exhausted || latest.status === "exhausted") return { action: "skip", snapshot };
  const initialFrontier =
    frontier > 0 &&
    (latest.plannerRuns ?? 0) === 0 &&
    (latest.analyzedNodeIds ?? []).length === 0 &&
    unseen.length === 0;
  if (initialFrontier) {
    return {
      action: "skip",
      snapshot: updateGraphCollection(
        snapshot,
        latest.collectionId,
        { status: "active" },
        runtime.eventLog.timestamp(),
      ),
    };
  }
  const target = latest.frontierTarget ?? snapshot.strategy.executor.frontierTarget;
  if (frontier >= target && unseen.length === 0) {
    return {
      action: "skip",
      snapshot: updateGraphCollection(
        snapshot,
        latest.collectionId,
        { status: "active" },
        runtime.eventLog.timestamp(),
      ),
    };
  }
  if ((latest.plannerRuns ?? 0) >= snapshot.strategy.executor.maxPlannerRuns)
    return { action: "exhaust", snapshot, collection: latest, reason: "max_planner_runs" };
  if ((latest.errorCount ?? 0) >= snapshot.strategy.executor.maxConsecutiveErrors)
    return { action: "exhaust", snapshot, collection: latest, reason: "planner_error_threshold" };
  return { action: "attempt", snapshot, collection: latest, unseen };
}
