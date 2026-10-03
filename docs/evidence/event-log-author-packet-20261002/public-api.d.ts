// Public declaration reference only; module labels identify real imports.
// The event-log class private declarations are intentionally omitted: storage is the author's choice.
// This combined reference is not a standalone compiler target or implementation.

// ./events.js: exact emitted public class surface
import type { WorkflowEvent, WorkflowGraphCollection, WorkflowNodeStatus, WorkflowRunSnapshot } from "@knorvia/contracts";
import type { AppliedPlannerExpansion, WorkflowGraphSchedulerDeps } from "./types.js";
export declare class WorkflowSchedulerEventLog {
    constructor(deps: WorkflowGraphSchedulerDeps);
    timestamp(): string;
    appendGraphStatus(snapshot: WorkflowRunSnapshot, nodeId: string, phase: string, status: WorkflowNodeStatus, signal?: AbortSignal): Promise<void>;
    appendCollectionRecord(snapshot: WorkflowRunSnapshot, collection: WorkflowGraphCollection, signal?: AbortSignal): Promise<void>;
    appendExpansionRecords(snapshot: WorkflowRunSnapshot, expansion: AppliedPlannerExpansion, phase: string, signal?: AbortSignal): Promise<void>;
    emitEvent(snapshot: WorkflowRunSnapshot, type: WorkflowEvent["type"], options?: {
        message?: string;
        nodeId?: string;
        payload?: Record<string, unknown>;
        phase?: string;
        signal?: AbortSignal;
    }): Promise<void>;
}

// ./types.js: exact public declarations. Referenced unrelated scheduler runner types
// retain their existing definitions and are not owned or implemented here.
import type { WorkflowGraph, WorkflowGraphNode, WorkflowGraphRecord,
  WorkflowGraphCollectionStatus } from "@knorvia/contracts";
import type { WorkflowGraphSchedulerPlannerRunner, WorkflowGraphSchedulerRunner } from "./types.js";

export interface WorkflowGraphSchedulerDeps {
  appendEvent(event: WorkflowEvent, options?: { signal?: AbortSignal }): Promise<void>;
  appendGraphRecord(
    runId: string,
    record: WorkflowGraphRecord,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  createActivityId: () => string;
  now: () => Date;
  onWorkflowEvent?: (event: WorkflowEvent) => void | Promise<void>;
  plannerRunner?: WorkflowGraphSchedulerPlannerRunner;
  runner: WorkflowGraphSchedulerRunner;
  writeArtifact(
    runId: string,
    relativePath: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ path: string; relativePath: string }>;
  writeSnapshot(snapshot: WorkflowRunSnapshot, options?: { signal?: AbortSignal }): Promise<void>;
}

export interface AppliedPlannerExpansion {
  addedEdges: WorkflowGraphRecordEdge[];
  addedNodes: WorkflowGraphNode[];
  collection: SchedulerCollection;
  snapshot: WorkflowRunSnapshot;
}

export type SchedulerCollection = WorkflowGraphCollection & {
  analyzedNodeIds: string[];
  errorCount: number;
  exhausted: boolean;
  explorable: boolean;
  nodeIds: string[];
  plannerRuns: number;
  status: WorkflowGraphCollectionStatus;
};
export type WorkflowGraphRecordEdge = WorkflowGraph["edges"][number];

// ./graph.js: existing dependency signature only
export declare function edgeId(edge: WorkflowGraphRecordEdge): string;
