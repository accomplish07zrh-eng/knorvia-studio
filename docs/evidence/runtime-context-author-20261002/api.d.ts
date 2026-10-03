import {
  type ExpertWorkflowRunSnapshot,
  type WorkflowActivitySnapshot,
  type WorkflowArtifact,
  type WorkflowDefinition,
  type WorkflowEvent,
  type WorkflowNodeStatus,
  type WorkflowPhaseDefinition,
  type WorkflowPhaseSnapshot,
} from "@knorvia/contracts";
import type { WorkflowGraphNodeChange, WorkflowSnapshotLifecycleResult } from "../lifecycle.js";
import type { ExpertWorkflowLookupOptions, ExpertWorkflowRuntimeDeps } from "./types.js";
export declare class ExpertWorkflowRuntimeContext {
  readonly activeRunAbortControllers: Map<string, AbortController>;
  readonly agentRunner: ExpertWorkflowRuntimeDeps["agentRunner"];
  readonly createActivityId: () => string;
  readonly createRunId: () => string;
  readonly definition: WorkflowDefinition;
  readonly now: () => Date;
  readonly onWorkflowEvent?: (event: WorkflowEvent) => void | Promise<void>;
  readonly phaseDefinitions: Map<string, WorkflowPhaseDefinition>;
  readonly store: ExpertWorkflowRuntimeDeps["store"];
  constructor(deps: ExpertWorkflowRuntimeDeps);
  createInitialSnapshot(options: {
    cwd: string;
    sessionId?: string;
    task: string;
    traceContext?: {
      traceId: string;
    };
  }): ExpertWorkflowRunSnapshot;
  writeInitialGraph(snapshot: ExpertWorkflowRunSnapshot, signal?: AbortSignal): Promise<void>;
  appendGraphStatus(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    status: WorkflowNodeStatus,
    signal?: AbortSignal,
  ): Promise<void>;
  appendGraphNodeStatus(
    snapshot: ExpertWorkflowRunSnapshot,
    nodeId: string,
    status: WorkflowNodeStatus,
    signal?: AbortSignal,
    phase?: string,
  ): Promise<void>;
  appendEvent(
    runId: string,
    type: WorkflowEvent["type"],
    options?: {
      message?: string;
      nodeId?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
  appendLifecycleGraphChanges(
    snapshot: ExpertWorkflowRunSnapshot,
    nodeChanges: readonly WorkflowGraphNodeChange[],
    signal?: AbortSignal,
  ): Promise<void>;
  updateSnapshot(
    snapshot: ExpertWorkflowRunSnapshot,
    patch: Partial<
      Pick<
        ExpertWorkflowRunSnapshot,
        | "completedAt"
        | "currentPhase"
        | "failure"
        | "pauseReason"
        | "recoveryActions"
        | "reportPath"
        | "startedAt"
        | "status"
      >
    >,
  ): ExpertWorkflowRunSnapshot;
  updatePhase(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    patch: Partial<WorkflowPhaseSnapshot>,
  ): ExpertWorkflowRunSnapshot;
  addArtifact(
    snapshot: ExpertWorkflowRunSnapshot,
    artifact: WorkflowArtifact,
  ): ExpertWorkflowRunSnapshot;
  upsertActivity(
    snapshot: ExpertWorkflowRunSnapshot,
    activity: WorkflowActivitySnapshot,
  ): ExpertWorkflowRunSnapshot;
  resolveSnapshot(options: ExpertWorkflowLookupOptions): Promise<ExpertWorkflowRunSnapshot | null>;
  getPhaseDefinition(phase: string): WorkflowPhaseDefinition;
  timestamp(): string;
  registerRunAbortSignal(
    runId: string,
    externalSignal: AbortSignal | undefined,
  ): {
    dispose: () => void;
    signal: AbortSignal;
  };
}
export declare function lifecyclePayload(
  result: WorkflowSnapshotLifecycleResult<ExpertWorkflowRunSnapshot>,
): Record<string, unknown>;
export declare function compactWorkflowPayload(
  value: Record<string, unknown | undefined>,
): Record<string, unknown>;
export declare function dedupeWorkflowNodeChanges(
  changes: WorkflowGraphNodeChange[],
): WorkflowGraphNodeChange[];
