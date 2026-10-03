// Existing module declarations; these are collaborators, not implementations to author.

// apps/cli/packages/core/src/workflow/scheduler/types.ts
export interface WorkflowGraphSchedulerActivityInput {
    abortSignal?: AbortSignal;
    activityId: string;
    cwd: string;
    node: WorkflowGraphNode;
    onChildSessionStarted?: (event: WorkflowGraphSchedulerChildSessionStartedEvent) => void | Promise<void>;
    onEvent?: (event: SessionEvent) => void | Promise<void>;
    parentSessionId?: string;
    phase: string;
    prompt: string;
    runId: string;
    task: string;
    traceContext?: TraceContext;
}
export interface WorkflowGraphSchedulerActivityResult {
    model?: string;
    response: string;
    sessionId: string;
    traceId?: string;
    turnId?: string;
}
export interface WorkflowGraphSchedulerChildSessionStartedEvent {
    model?: string;
    sessionId: string;
    traceId?: string;
    turnId?: string;
}
export interface WorkflowGraphSchedulerRunner {
    run(input: WorkflowGraphSchedulerActivityInput): Promise<WorkflowGraphSchedulerActivityResult>;
}
export interface WorkflowGraphSchedulerDeps {
    appendEvent(event: WorkflowEvent, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
    appendGraphRecord(runId: string, record: WorkflowGraphRecord, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
    createActivityId: () => string;
    now: () => Date;
    onWorkflowEvent?: (event: WorkflowEvent) => void | Promise<void>;
    plannerRunner?: WorkflowGraphSchedulerPlannerRunner;
    runner: WorkflowGraphSchedulerRunner;
    writeArtifact(runId: string, relativePath: string, content: string, options?: {
        signal?: AbortSignal;
    }): Promise<{
        path: string;
        relativePath: string;
    }>;
    writeSnapshot(snapshot: WorkflowRunSnapshot, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
}
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
export interface NodeRunStarted {
    snapshot: WorkflowRunSnapshot;
}
export interface NodeRunOutcome {
    nodeId: string;
    ok: boolean;
    snapshot: WorkflowRunSnapshot;
}
export interface WorkflowGraphSchedulerSnapshotAccess {
    getSnapshot(): WorkflowRunSnapshot;
    setSnapshot(snapshot: WorkflowRunSnapshot): WorkflowRunSnapshot;
}
export type WorkflowSchedulerNodePromise = Promise<NodeRunOutcome> & {
    started: Promise<NodeRunStarted>;
};

// apps/cli/packages/core/src/workflow/scheduler/graph.ts
export declare function updateGraphNode(snapshot: WorkflowRunSnapshot, nodeId: string, patch: Partial<Pick<WorkflowGraphNode, "attempts" | "error" | "status">>): WorkflowRunSnapshot;
export declare function upsertActivity(snapshot: WorkflowRunSnapshot, activity: WorkflowActivitySnapshot, timestamp: string): WorkflowRunSnapshot;
export declare function addArtifact(snapshot: WorkflowRunSnapshot, artifact: WorkflowArtifact, timestamp: string): WorkflowRunSnapshot;
export declare function compactWorkflowPayload(value: Record<string, unknown | undefined>): Record<string, unknown>;

// apps/cli/packages/core/src/workflow/scheduler/prompts.ts
export declare function buildDefaultNodePrompt(snapshot: WorkflowRunSnapshot, node: WorkflowGraphNode, phase: string): string;
export declare function safeArtifactName(value: string): string;

// apps/cli/packages/contracts/src/tracing/tracer.ts
export interface TraceContext {
    traceId: TraceId;
    queryId?: QueryId;
    spanId?: string;
    parentSpanId?: string;
    parentId?: string;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
}
export declare function createChildTraceContext(parent: TraceContext, options?: {
    queryId?: QueryId;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
}): TraceContext;

// ./events.js public methods; private layout omitted.
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
