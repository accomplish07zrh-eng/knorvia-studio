// Structural author aid; import production types, do not export these aliases.
interface WorkflowPhaseDefinition {
  phase: string;
  title: string;
  behavior: "complete" | "scheduled_graph" | "critic" | "agent";
}
interface Failure {
  kind: string;
  message: string;
  retryable: boolean;
}
interface ExpertWorkflowRunSnapshot {
  startedAt?: string;
  reportPath?: string;
  runId: string;
  status: string;
  traceId?: string;
  currentPhase?: string;
  failure?: Failure;
  phases: { phase: string; status: string }[];
}
interface ExpertWorkflowRunOptions {
  abortSignal?: AbortSignal;
  cwd: string;
  task: string;
}
interface ExpertWorkflowCommandResult {
  response: string;
  reportPath?: string;
  runId?: string;
  snapshot?: ExpertWorkflowRunSnapshot;
  status?: string;
  traceId?: string;
}
interface ExpertWorkflowRuntimeContext {
  definition: { title: string; phaseOrder: string[] };
  getPhaseDefinition(id: string): WorkflowPhaseDefinition;
  timestamp(): string;
  updateSnapshot(
    snapshot: ExpertWorkflowRunSnapshot,
    patch: {
      startedAt?: string;
      status?: string;
      completedAt?: string;
      reportPath?: string;
      failure?: Failure;
      pauseReason?: string;
      recoveryActions?: unknown[];
    },
  ): ExpertWorkflowRunSnapshot;
  updatePhase(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    patch: { artifactPath?: string; completedAt?: string; startedAt?: string; status?: string },
  ): ExpertWorkflowRunSnapshot;
  addArtifact(
    snapshot: ExpertWorkflowRunSnapshot,
    artifact: {
      contentType: string;
      createdAt: string;
      label: string;
      path: string;
      phase?: string;
    },
  ): ExpertWorkflowRunSnapshot;
  appendGraphStatus(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    status: string,
    signal?: AbortSignal,
  ): Promise<void>;
  appendLifecycleGraphChanges(
    snapshot: ExpertWorkflowRunSnapshot,
    changes: unknown[],
  ): Promise<void>;
  appendEvent(
    runId: string,
    type: string,
    options: {
      message?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
  store: {
    readRun(
      runId: string,
      options?: { signal?: AbortSignal },
    ): Promise<ExpertWorkflowRunSnapshot | null>;
    writeSnapshot(
      snapshot: ExpertWorkflowRunSnapshot,
      options?: { signal?: AbortSignal },
    ): Promise<void>;
    writeReport(
      runId: string,
      content: string,
      options?: { signal?: AbortSignal },
    ): Promise<{ relativePath: string }>;
  };
}
// Import types WorkflowPhaseDefinition/ExpertWorkflowRunSnapshot from @knorvia/contracts;
// ExpertWorkflowRuntimeContext from ./runtime-context.js;
// ExpertWorkflowCommandResult/ExpertWorkflowRunOptions from ./types.js.
// Dependency runtime imports (same-module receivers not required for free functions):
// ../lifecycle.js
interface Repair {
  snapshot: ExpertWorkflowRunSnapshot;
  nodeChanges: unknown[];
}
declare function cancelWorkflowSnapshot(
  snapshot: ExpertWorkflowRunSnapshot,
  options: { reason: string; timestamp: string },
): Repair;
// ./runtime-context.js
declare function compactWorkflowPayload(value: Record<string, unknown>): Record<string, unknown>;
declare function lifecyclePayload(value: Repair): Record<string, unknown>;
// ./failures.js
declare function latestWorkflowActivity(snapshot: ExpertWorkflowRunSnapshot): unknown;
declare function workflowFailureFromError(
  error: unknown,
  message: string,
  activity: unknown,
): Failure;
declare function workflowRecoveryActions(failure: Failure): unknown[];
// ./formatters.js
declare function formatExpertWorkflowCompletion(snapshot: ExpertWorkflowRunSnapshot): string;
declare function formatExpertWorkflowStatus(snapshot: ExpertWorkflowRunSnapshot): string;
// ./prompts.js
declare function buildReport(snapshot: ExpertWorkflowRunSnapshot): string;
// ./phase-runner.js
declare function runPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<{ response: string; snapshot: ExpertWorkflowRunSnapshot }>;
// ./scheduled-phase.js
declare function runScheduledPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot>;
// ./critic-loop.js
declare function runFinalCriticLoop(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot>;
// ./graph-artifacts.js
declare function seedGraphFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot>;
declare function updateNodePromptsFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot>;
// Sole public export. Additional private types/functions are author choices.
export declare function continueRun(
  ctx: ExpertWorkflowRuntimeContext,
  initialSnapshot: ExpertWorkflowRunSnapshot,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowCommandResult>;
