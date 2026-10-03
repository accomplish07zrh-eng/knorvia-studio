// Existing collaborator declarations; not runtime implementations or standalone compile target.

// apps/cli/packages/core/src/workflow/scheduler/graph.ts
export declare function updateGraphCollection(snapshot: WorkflowRunSnapshot, collectionId: string, patch: Partial<WorkflowGraphCollection>, timestamp: string): WorkflowRunSnapshot;
export declare function collectionNodeIdsForGraph(collection: WorkflowGraphCollection, graph: WorkflowGraph): string[];
export declare function nodeById(graph: WorkflowGraph, nodeId: string): WorkflowGraphNode | undefined;
export declare function edgeId(edge: WorkflowGraphRecordEdge): string;

// apps/cli/packages/core/src/workflow/scheduler/types.ts
export interface WorkflowGraphSchedulerRunOptions {
    abortSignal?: AbortSignal;
    artifactDirectory?: string;
    buildPrompt?: (input: {
        node: WorkflowGraphNode;
        phase: string;
        snapshot: WorkflowRunSnapshot;
    }) => string;
    cwd: string;
    executableNodeIds?: Iterable<string>;
    onEvent?: (event: SessionEvent) => void | Promise<void>;
    parentSessionId?: string;
    phase: string;
    snapshot: WorkflowRunSnapshot;
    traceContext?: TraceContext;
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

// apps/cli/packages/core/src/workflow/scheduler/collection-runtime.ts
export interface WorkflowCollectionPlannerRuntime {
    createActivityId: () => string;
    eventLog: WorkflowSchedulerEventLog;
    plannerRunner?: WorkflowGraphSchedulerDeps["plannerRunner"];
    writeArtifact: WorkflowGraphSchedulerDeps["writeArtifact"];
    writeSnapshot: WorkflowGraphSchedulerDeps["writeSnapshot"];
}

// ./events.js (public methods only)
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
