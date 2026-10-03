import { z } from "zod";
import {
  WorkflowGraphNodeSchema,
  WorkflowGraphCollectionSchema,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "./graph-schema.js";
import {
  WorkflowGraphCollectionStatusSchema,
  WorkflowPhaseIdSchema,
  type WorkflowNodeStatus,
} from "./definition.js";
import { type WorkflowRunSnapshot } from "./run-schema.js";

export const WorkflowSchedulerDerivedNodeSchema = z.object({
  blockedBy: z.array(z.string()),
  collectionIds: z.array(z.string()).default([]),
  incoming: z.array(z.string()),
  node: WorkflowGraphNodeSchema,
  outgoing: z.array(z.string()),
  ready: z.boolean(),
});

export type WorkflowSchedulerDerivedNode = z.infer<typeof WorkflowSchedulerDerivedNodeSchema>;

export const WorkflowSchedulerCollectionStateSchema = z.object({
  activeNodeIds: z.array(z.string()),
  collection: WorkflowGraphCollectionSchema,
  completedNodeIds: z.array(z.string()),
  errorCount: z.number().int().nonnegative(),
  exhausted: z.boolean(),
  failedNodeIds: z.array(z.string()),
  frontier: z.number().int().nonnegative(),
  frontierTarget: z.number().int().positive().optional(),
  pendingNodeIds: z.array(z.string()),
  plannerRuns: z.number().int().nonnegative(),
  readyNodeIds: z.array(z.string()),
  status: WorkflowGraphCollectionStatusSchema,
});

export type WorkflowSchedulerCollectionState = z.infer<
  typeof WorkflowSchedulerCollectionStateSchema
>;

export const WorkflowSchedulerActiveActivitySchema = z.object({
  activityId: z.string(),
  nodeId: z.string().optional(),
  phase: WorkflowPhaseIdSchema,
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});

export type WorkflowSchedulerActiveActivity = z.infer<typeof WorkflowSchedulerActiveActivitySchema>;

export const WorkflowSchedulerStateSchema = z.object({
  activeActivities: z.array(WorkflowSchedulerActiveActivitySchema),
  activeChildSessionIds: z.array(z.string()),
  activeNodeIds: z.array(z.string()),
  blockedNodes: z.array(
    z.object({
      blockedBy: z.array(z.string()),
      nodeId: z.string(),
    }),
  ),
  counts: z.object({
    active: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  collectionStates: z.array(WorkflowSchedulerCollectionStateSchema).default([]),
  nodes: z.array(WorkflowSchedulerDerivedNodeSchema),
  readyNodeIds: z.array(z.string()),
});

export type WorkflowSchedulerState = z.infer<typeof WorkflowSchedulerStateSchema>;

const TERMINAL_DEPENDENCY_STATUSES = new Set<WorkflowNodeStatus>([
  "cancelled",
  "completed",
  "failed",
  "skipped",
]);

export function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState {
  const nodesById = new Map<string, WorkflowGraphNode>();
  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
  }

  const incomingById = new Map<string, Set<string>>();
  const outgoingById = new Map<string, Set<string>>();
  for (const [id, node] of nodesById) {
    incomingById.set(id, new Set(node.dependsOn));
  }
  for (const edge of graph.edges) {
    let incoming = incomingById.get(edge.to);
    if (incoming === undefined) {
      incoming = new Set<string>();
      incomingById.set(edge.to, incoming);
    }
    incoming.add(edge.from);

    let outgoing = outgoingById.get(edge.from);
    if (outgoing === undefined) {
      outgoing = new Set<string>();
      outgoingById.set(edge.from, outgoing);
    }
    outgoing.add(edge.to);
  }

  const collections = graph.collections ?? [];
  const collectionIdsByNodeId = new Map<string, string[]>();
  for (const collection of collections) {
    for (const nodeId of collection.nodeIds ?? []) {
      let collectionIds = collectionIdsByNodeId.get(nodeId);
      if (collectionIds === undefined) {
        collectionIds = [];
        collectionIdsByNodeId.set(nodeId, collectionIds);
      }
      collectionIds.push(collection.collectionId);
    }
  }
  for (const node of graph.nodes) {
    if (node.collectionId) {
      let collectionIds = collectionIdsByNodeId.get(node.id);
      if (collectionIds === undefined) {
        collectionIds = [];
        collectionIdsByNodeId.set(node.id, collectionIds);
      }
      if (!collectionIds.includes(node.collectionId)) {
        collectionIds.push(node.collectionId);
      }
    }
  }

  const activeNodeIds: string[] = [];
  const blockedNodes: WorkflowSchedulerState["blockedNodes"] = [];
  const nodes: WorkflowSchedulerState["nodes"] = [];
  const readyNodeIds: string[] = [];
  const counts: WorkflowSchedulerState["counts"] = {
    active: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    ready: 0,
    total: graph.nodes.length,
  };

  for (const node of graph.nodes) {
    const incoming = Array.from(incomingById.get(node.id) ?? []);
    const outgoing = Array.from(outgoingById.get(node.id) ?? []);
    const blockedBy = incoming.filter((dependencyId) => {
      const dependency = nodesById.get(dependencyId);
      return dependency === undefined || !TERMINAL_DEPENDENCY_STATUSES.has(dependency.status);
    });
    const ready = node.status === "pending" && blockedBy.length === 0;
    nodes.push({
      blockedBy,
      collectionIds: collectionIdsByNodeId.get(node.id) ?? [],
      incoming,
      node,
      outgoing,
      ready,
    });

    switch (node.status) {
      case "active":
        counts.active += 1;
        activeNodeIds.push(node.id);
        break;
      case "completed":
        counts.completed += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "pending":
        counts.pending += 1;
        if (blockedBy.length > 0) {
          counts.blocked += 1;
          blockedNodes.push({ blockedBy, nodeId: node.id });
        }
        break;
    }
    if (ready) {
      counts.ready += 1;
      readyNodeIds.push(node.id);
    }
  }

  const collectionStates: WorkflowSchedulerState["collectionStates"] = [];
  for (const collection of collections) {
    const memberIds = new Set(collection.nodeIds ?? []);
    for (const node of graph.nodes) {
      if (node.collectionId === collection.collectionId) {
        memberIds.add(node.id);
      }
    }

    const active: string[] = [];
    const pending: string[] = [];
    const completed: string[] = [];
    const failed: string[] = [];
    for (const nodeId of memberIds) {
      switch (nodesById.get(nodeId)?.status) {
        case "active":
          active.push(nodeId);
          break;
        case "pending":
          pending.push(nodeId);
          break;
        case "completed":
          completed.push(nodeId);
          break;
        case "failed":
          failed.push(nodeId);
          break;
      }
    }

    collectionStates.push({
      activeNodeIds: active,
      collection,
      completedNodeIds: completed,
      errorCount: collection.errorCount ?? 0,
      exhausted: collection.exhausted ?? false,
      failedNodeIds: failed,
      frontier: active.length + pending.length,
      frontierTarget: collection.frontierTarget,
      pendingNodeIds: pending,
      plannerRuns: collection.plannerRuns ?? 0,
      readyNodeIds: readyNodeIds.filter((nodeId) => memberIds.has(nodeId)),
      status: collection.status ?? "active",
    });
  }

  return {
    activeActivities: [],
    activeChildSessionIds: [],
    activeNodeIds,
    blockedNodes,
    counts,
    collectionStates,
    nodes,
    readyNodeIds,
  };
}

export function deriveWorkflowRunSchedulerState(
  snapshot: WorkflowRunSnapshot,
): WorkflowSchedulerState {
  const state = deriveWorkflowSchedulerState(snapshot.graph);
  const activeActivities = snapshot.activities
    .filter((activity) => activity.status === "active")
    .map((activity) => ({
      activityId: activity.activityId,
      ...(activity.nodeId ? { nodeId: activity.nodeId } : {}),
      phase: activity.phase,
      ...(activity.sessionId ? { sessionId: activity.sessionId } : {}),
      ...(activity.traceId ? { traceId: activity.traceId } : {}),
      ...(activity.turnId ? { turnId: activity.turnId } : {}),
    }));

  return {
    ...state,
    activeActivities,
    activeChildSessionIds: activeActivities
      .map((activity) => activity.sessionId)
      .filter((sessionId): sessionId is string => sessionId !== undefined),
  };
}
