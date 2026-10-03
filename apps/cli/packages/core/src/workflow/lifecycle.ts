import {
  deriveWorkflowSessionLinks,
  WorkflowNodePromptUpdateSetSchema,
  type WorkflowGraphCollection,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
  type WorkflowNodePromptUpdate,
  type WorkflowNodeStatus,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";

export { applyWorkflowGraphSeed } from "./lifecycle-seed.js";

export interface WorkflowGraphNodeChange {
  nodeId: string;
  phase?: string;
  status: WorkflowNodeStatus;
}

export interface WorkflowSnapshotLifecycleResult<TSnapshot extends WorkflowRunSnapshot> {
  activityIds: string[];
  changed: boolean;
  nodeChanges: WorkflowGraphNodeChange[];
  phaseIds: string[];
  snapshot: TSnapshot;
}

export interface ReconcileWorkflowSnapshotForResumeOptions {
  nodeIds?: Iterable<string>;
  reason?: string;
  resetActivities?: boolean;
  resetPhases?: boolean;
  timestamp: string;
}

export interface CancelWorkflowSnapshotOptions {
  reason?: string;
  timestamp: string;
}

export interface ReopenWorkflowGraphNodeOptions {
  maxReopens?: number;
  nodeId: string;
  reason?: string;
  timestamp: string;
}

export interface ReopenWorkflowGraphNodeResult<TSnapshot extends WorkflowRunSnapshot> {
  changed: boolean;
  nodeChange: WorkflowGraphNodeChange;
  reopenAttempts: number;
  snapshot: TSnapshot;
}

export interface ApplyWorkflowGraphSeedOptions {
  phase?: string;
  timestamp: string;
}

export interface ApplyWorkflowGraphSeedResult<TSnapshot extends WorkflowRunSnapshot> {
  addedCollections: WorkflowGraphCollection[];
  addedEdges: WorkflowGraphEdge[];
  addedNodes: WorkflowGraphNode[];
  changed: boolean;
  snapshot: TSnapshot;
}

export interface ApplyWorkflowNodePromptUpdatesOptions {
  phase: string;
  timestamp: string;
}

export interface ApplyWorkflowNodePromptUpdatesResult<TSnapshot extends WorkflowRunSnapshot> {
  changed: boolean;
  snapshot: TSnapshot;
  updatedNodes: WorkflowGraphNode[];
}

function nodeChange(node: WorkflowGraphNode, status: WorkflowNodeStatus): WorkflowGraphNodeChange {
  return {
    nodeId: node.id,
    ...(node.phase ? { phase: node.phase } : {}),
    status,
  };
}

function isCancellable(status: WorkflowNodeStatus): boolean {
  return status === "active" || status === "pending";
}

export function reconcileWorkflowSnapshotForResume<TSnapshot extends WorkflowRunSnapshot>(
  snapshot: TSnapshot,
  options: ReconcileWorkflowSnapshotForResumeOptions,
): WorkflowSnapshotLifecycleResult<TSnapshot> {
  const reason =
    options.reason ??
    "Reset during workflow resume because the previous process stopped before completion.";
  const scope = options.nodeIds ? new Set(options.nodeIds) : undefined;
  const resetActivities = options.resetActivities ?? true;
  const resetPhases = options.resetPhases ?? true;
  const activityIds: string[] = [];
  const nodeChanges: WorkflowGraphNodeChange[] = [];
  const phaseIds: string[] = [];
  const resetNodePhases = new Set<string>();

  const nodes = snapshot.graph.nodes.map((node) => {
    if (node.status !== "active" || (scope && !scope.has(node.id))) return node;
    nodeChanges.push(nodeChange(node, "pending"));
    if (node.phase) resetNodePhases.add(node.phase);
    return { ...node, error: reason, status: "pending" as const };
  });
  const phases = snapshot.phases.map((phase) => {
    if (!resetPhases || phase.status !== "active" || (scope && !resetNodePhases.has(phase.phase)))
      return phase;
    phaseIds.push(phase.phase);
    return { error: reason, phase: phase.phase, status: "pending" as const };
  });
  const activities = snapshot.activities.map((activity) => {
    const selected =
      !scope ||
      (!!activity.nodeId && scope.has(activity.nodeId)) ||
      resetNodePhases.has(activity.phase);
    if (!resetActivities || activity.status !== "active" || !selected) return activity;
    activityIds.push(activity.activityId);
    const timestamp = options.timestamp;
    return {
      ...activity,
      completedAt: activity.completedAt ?? timestamp,
      error: activity.error ?? reason,
      status: "cancelled" as const,
    };
  });
  const changed = nodeChanges.length > 0 || phaseIds.length > 0 || activityIds.length > 0;
  const next = changed
    ? {
        ...snapshot,
        activities,
        graph: { collections: snapshot.graph.collections, edges: snapshot.graph.edges, nodes },
        phases,
        sessionLinks: deriveWorkflowSessionLinks({ activities, runId: snapshot.runId }),
        updatedAt: options.timestamp,
      }
    : snapshot;
  return { activityIds, changed, nodeChanges, phaseIds, snapshot: next };
}

export function cancelWorkflowSnapshot<TSnapshot extends WorkflowRunSnapshot>(
  snapshot: TSnapshot,
  options: CancelWorkflowSnapshotOptions,
): WorkflowSnapshotLifecycleResult<TSnapshot> {
  const reason = options.reason ?? "Workflow cancelled.";
  const activityIds: string[] = [];
  const nodeChanges: WorkflowGraphNodeChange[] = [];
  const phaseIds: string[] = [];
  const nodes = snapshot.graph.nodes.map((node) => {
    if (!isCancellable(node.status)) return node;
    nodeChanges.push(nodeChange(node, "cancelled"));
    return { ...node, error: reason, status: "cancelled" as const };
  });
  const phases = snapshot.phases.map((phase) => {
    if (!isCancellable(phase.status)) return phase;
    phaseIds.push(phase.phase);
    const timestamp = options.timestamp;
    return {
      ...phase,
      completedAt: phase.completedAt ?? timestamp,
      error: phase.error ?? reason,
      status: "cancelled" as const,
    };
  });
  const activities = snapshot.activities.map((activity) => {
    if (!isCancellable(activity.status)) return activity;
    activityIds.push(activity.activityId);
    const timestamp = options.timestamp;
    return {
      ...activity,
      completedAt: activity.completedAt ?? timestamp,
      error: activity.error ?? reason,
      status: "cancelled" as const,
    };
  });
  const changed =
    snapshot.status !== "cancelled" ||
    snapshot.completedAt !== options.timestamp ||
    nodeChanges.length > 0 ||
    phaseIds.length > 0 ||
    activityIds.length > 0;
  const next = changed
    ? {
        ...snapshot,
        activities,
        completedAt: options.timestamp,
        graph: { collections: snapshot.graph.collections, edges: snapshot.graph.edges, nodes },
        phases,
        sessionLinks: deriveWorkflowSessionLinks({ activities, runId: snapshot.runId }),
        status: "cancelled" as const,
        updatedAt: options.timestamp,
      }
    : snapshot;
  return { activityIds, changed, nodeChanges, phaseIds, snapshot: next };
}

export function reopenWorkflowGraphNode<TSnapshot extends WorkflowRunSnapshot>(
  snapshot: TSnapshot,
  options: ReopenWorkflowGraphNodeOptions,
): ReopenWorkflowGraphNodeResult<TSnapshot> {
  const first = snapshot.graph.nodes.find((node) => node.id === options.nodeId);
  if (!first) throw new Error(`Workflow graph node not found: ${options.nodeId}`);
  if (first.status !== "completed" && first.status !== "failed" && first.status !== "skipped") {
    throw new Error(
      `Cannot reopen workflow node "${options.nodeId}": status is "${first.status}", expected completed, failed, or skipped`,
    );
  }
  const maxReopens = options.maxReopens ?? 2;
  const previous = first.reopenAttempts ?? 0;
  if (previous >= maxReopens) {
    throw new Error(
      `Workflow node "${options.nodeId}" already reopened ${previous}x (max=${maxReopens})`,
    );
  }
  const reopenAttempts = previous + 1;
  const reason = options.reason ?? "Reopened by workflow critic.";
  const nodes = snapshot.graph.nodes.map((node) =>
    node.id === options.nodeId
      ? {
          ...node,
          error: reason,
          reopenAttempts,
          status: "pending" as const,
        }
      : node,
  );
  return {
    changed: true,
    nodeChange: nodeChange(first, "pending"),
    reopenAttempts,
    snapshot: {
      ...snapshot,
      graph: { collections: snapshot.graph.collections, edges: snapshot.graph.edges, nodes },
      updatedAt: options.timestamp,
    },
  };
}

export function applyWorkflowNodePromptUpdates<TSnapshot extends WorkflowRunSnapshot>(
  snapshot: TSnapshot,
  updates: readonly WorkflowNodePromptUpdate[],
  options: ApplyWorkflowNodePromptUpdatesOptions,
): ApplyWorkflowNodePromptUpdatesResult<TSnapshot> {
  const parsed = WorkflowNodePromptUpdateSetSchema.parse({ nodes: updates });
  const byId = new Map<string, WorkflowNodePromptUpdate>();
  for (const update of parsed.nodes) {
    if (byId.has(update.id)) {
      throw new Error(`Workflow node prompt update returned duplicate node: ${update.id}`);
    }
    byId.set(update.id, update);
  }
  if (byId.size === 0) return { changed: false, snapshot, updatedNodes: [] };
  const knownNodes = new Set(snapshot.graph.nodes.map((node) => node.id));
  for (const id of byId.keys()) {
    if (!knownNodes.has(id)) {
      throw new Error(`Workflow node prompt update references unknown node: ${id}`);
    }
  }
  const updatedNodes: WorkflowGraphNode[] = [];
  const nodes = snapshot.graph.nodes.map((node) => {
    const update = byId.get(node.id);
    if (!update) return node;
    if (node.phase !== undefined && node.phase !== options.phase) {
      throw new Error(
        `Workflow node prompt update for "${node.id}" targets phase "${options.phase}" but node belongs to "${node.phase}"`,
      );
    }
    const candidate = {
      ...node,
      description: update.description ?? node.description,
      prompt: update.prompt ?? node.prompt,
      title: update.title ?? node.title,
    };
    if (
      candidate.description === node.description &&
      candidate.prompt === node.prompt &&
      candidate.title === node.title
    )
      return node;
    updatedNodes.push(candidate);
    return candidate;
  });
  if (updatedNodes.length === 0) return { changed: false, snapshot, updatedNodes };
  return {
    changed: true,
    snapshot: {
      ...snapshot,
      graph: { collections: snapshot.graph.collections, edges: snapshot.graph.edges, nodes },
      updatedAt: options.timestamp,
    },
    updatedNodes,
  };
}
