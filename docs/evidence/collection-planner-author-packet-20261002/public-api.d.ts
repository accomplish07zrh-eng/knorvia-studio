// Public API extracts at the frozen checkpoint. Module labels indicate real imports.
// This reference file is not a standalone compile target. Imported contract types retain
// their existing public definitions; data schema excerpts are in public-data-shapes.md.
import type { SessionEvent, TraceContext, WorkflowActivitySnapshot, WorkflowArtifact,
  WorkflowEvent, WorkflowGraph, WorkflowGraphCollection, WorkflowGraphCollectionStatus,
  WorkflowGraphNode, WorkflowGraphPlannerResult, WorkflowRunSnapshot } from "@knorvia/contracts";

// ./collection-planner.js: required replacement export
export declare function checkCollectionPlanners(
  snapshot: WorkflowRunSnapshot, executableNodeIds: Set<string>,
  options: WorkflowGraphSchedulerRunOptions, runtime: WorkflowCollectionPlannerRuntime,
): Promise<{ addedNodeIds: string[]; plannersRan: number; snapshot: WorkflowRunSnapshot }>;

// ./types.js: exact public declaration extracts
export interface WorkflowGraphSchedulerChildSessionStartedEvent {
  model?: string;
  sessionId: string;
  traceId?: string;
  turnId?: string;
}

export interface WorkflowGraphSchedulerPlannerInput {
  abortSignal?: AbortSignal;
  activityId: string;
  collection: WorkflowGraphCollection;
  cwd: string;
  graph: WorkflowGraph;
  onChildSessionStarted?: (
    event: WorkflowGraphSchedulerChildSessionStartedEvent,
  ) => void | Promise<void>;
  onEvent?: (event: SessionEvent) => void | Promise<void>;
  parentSessionId?: string;
  phase: string;
  prompt: string;
  runId: string;
  snapshot: WorkflowRunSnapshot;
  task: string;
  traceContext?: TraceContext;
}

export interface WorkflowGraphSchedulerPlannerRunResult extends WorkflowGraphPlannerResult {
  model?: string;
  response: string;
  sessionId: string;
  traceId?: string;
  turnId?: string;
}

export interface WorkflowGraphSchedulerPlannerRunner {
  run(input: WorkflowGraphSchedulerPlannerInput): Promise<WorkflowGraphSchedulerPlannerRunResult>;
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

// ./collection-runtime.js: public runtime port shape; write port types expanded from deps.
export interface WorkflowCollectionPlannerRuntime {
  createActivityId: () => string;
  eventLog: WorkflowSchedulerEventLog;
  plannerRunner?: WorkflowGraphSchedulerPlannerRunner;
  writeArtifact(runId: string, relativePath: string, content: string,
    options?: { signal?: AbortSignal }): Promise<{ path: string; relativePath: string }>;
  writeSnapshot(snapshot: WorkflowRunSnapshot, options?: { signal?: AbortSignal }): Promise<void>;
}

// ./events.js: relevant public methods only, no private fields or method bodies.
export declare class WorkflowSchedulerEventLog {
  timestamp(): string;
  appendCollectionRecord(snapshot: WorkflowRunSnapshot, collection: WorkflowGraphCollection,
    signal?: AbortSignal): Promise<void>;
  appendExpansionRecords(snapshot: WorkflowRunSnapshot, expansion: AppliedPlannerExpansion,
    phase: string, signal?: AbortSignal): Promise<void>;
  emitEvent(snapshot: WorkflowRunSnapshot, type: WorkflowEvent["type"], options?: {
    message?: string; nodeId?: string; payload?: Record<string, unknown>;
    phase?: string; signal?: AbortSignal;
  }): Promise<void>;
}

// ./graph.js: call these existing dependencies; do not implement them.
export declare function graphCollections(graph: WorkflowGraph): SchedulerCollection[];
export declare function normalizeCollection(collection: WorkflowGraphCollection): SchedulerCollection;
export declare function collectionNodeIdsForGraph(collection: WorkflowGraphCollection, graph: WorkflowGraph): string[];
export declare function collectionFrontier(graph: WorkflowGraph, collection: WorkflowGraphCollection): number;
export declare function nodeById(graph: WorkflowGraph, nodeId: string): WorkflowGraphNode | undefined;
export declare function isCollectionInPhase(collection: WorkflowGraphCollection, graph: WorkflowGraph,
  executableNodeIds: Set<string>, phase: string): boolean;
export declare function updateGraphCollection(snapshot: WorkflowRunSnapshot, collectionId: string,
  patch: Partial<WorkflowGraphCollection>, timestamp: string): WorkflowRunSnapshot;
export declare function upsertActivity(snapshot: WorkflowRunSnapshot, activity: WorkflowActivitySnapshot,
  timestamp: string): WorkflowRunSnapshot;
export declare function addArtifact(snapshot: WorkflowRunSnapshot, artifact: WorkflowArtifact,
  timestamp: string): WorkflowRunSnapshot;
export declare function compactWorkflowPayload(value: Record<string, unknown | undefined>): Record<string, unknown>;

// ./collection-events.js
export declare function exhaustCollection(snapshot: WorkflowRunSnapshot, collection: SchedulerCollection,
  options: WorkflowGraphSchedulerRunOptions, runtime: WorkflowCollectionPlannerRuntime,
  payload: Record<string, unknown>): Promise<WorkflowRunSnapshot>;
export declare function emitExpansionEvents(snapshot: WorkflowRunSnapshot, expansion: AppliedPlannerExpansion,
  collectionId: string, options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime): Promise<void>;

// ./planner-expansion.js
export declare function applyPlannerExpansion(snapshot: WorkflowRunSnapshot, collection: SchedulerCollection,
  rawResult: WorkflowGraphSchedulerPlannerRunResult, unseenCompletions: readonly string[], timestamp: string): AppliedPlannerExpansion;

// ./prompts.js
export declare function buildDefaultPlannerPrompt(snapshot: WorkflowRunSnapshot,
  collection: WorkflowGraphCollection, phase: string): string;
export declare function safeArtifactName(value: string): string;

// @knorvia/contracts: public trace factory (QueryId/SessionId/TurnId are string aliases).
export declare function createChildTraceContext(parent: TraceContext, options?: {
  queryId?: string; sessionId?: string; turnId?: string;
  attributes?: Record<string, string | number | boolean>;
}): TraceContext;
