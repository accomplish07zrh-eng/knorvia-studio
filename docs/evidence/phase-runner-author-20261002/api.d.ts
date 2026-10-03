// Minimal packet declarations only; production imports use the paths below.
interface TraceContext {
  traceId: string;
  sessionId?: string;
  [key: string]: unknown;
}
interface WorkflowPhaseDefinition {
  phase: string;
  title: string;
  artifactPath?: string;
}
interface Activity {
  activityId: string;
  inputArtifactPaths: string[];
  kind: "agent_session";
  nodeId?: string;
  outputArtifactPaths: string[];
  parentSessionId?: string;
  phase: string;
  startedAt: string;
  status: string;
  traceId?: string;
  model?: string;
  sessionId?: string;
  turnId?: string;
  artifactPath?: string;
  completedAt?: string;
  error?: string;
}
interface Artifact {
  path: string;
  [key: string]: unknown;
}
interface ExpertWorkflowRunSnapshot {
  artifacts: Artifact[];
  activities: Activity[];
  runId: string;
  sessionId?: string;
  task: string;
  [key: string]: unknown;
}
interface ChildStarted {
  sessionId: string;
  model?: string;
  traceId?: string;
  turnId?: string;
}
interface AgentResult {
  response: string;
  sessionId: string;
  model?: string;
  traceId?: string;
  turnId?: string;
}
interface AgentInput {
  abortSignal?: AbortSignal;
  activityId: string;
  cwd: string;
  onChildSessionStarted?: (event: ChildStarted) => void | Promise<void>;
  onEvent?: (event: unknown) => void | Promise<void>;
  parentSessionId?: string;
  phase: string;
  prompt: string;
  runId: string;
  task: string;
  traceContext?: TraceContext;
  workflowKind?: string;
}
interface ExpertWorkflowRunOptions {
  abortSignal?: AbortSignal;
  cwd: string;
  onEvent?: (event: unknown) => void | Promise<void>;
  traceContext?: TraceContext;
  task: string;
}
interface ExpertPhaseRunResult {
  response: string;
  snapshot: ExpertWorkflowRunSnapshot;
}
interface PhasePatch {
  activityId?: string;
  artifactPath?: string;
  completedAt?: string;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  status?: "active" | "completed" | "failed";
  traceId?: string;
  turnId?: string;
}
interface ExpertWorkflowRuntimeContext {
  definition: { kind: string };
  createActivityId(): string;
  timestamp(): string;
  updatePhase(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    patch: PhasePatch,
  ): ExpertWorkflowRunSnapshot;
  upsertActivity(
    snapshot: ExpertWorkflowRunSnapshot,
    activity: Activity,
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
  store: {
    writeSnapshot(
      snapshot: ExpertWorkflowRunSnapshot,
      options?: { signal?: AbortSignal },
    ): Promise<void>;
    writeArtifact(
      runId: string,
      relativePath: string,
      content: string,
      options?: { signal?: AbortSignal },
    ): Promise<{ path: string; relativePath: string }>;
  };
  agentRunner: { run(input: AgentInput): Promise<AgentResult> };
  appendGraphStatus(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    status: "active" | "completed" | "failed",
    signal?: AbortSignal,
  ): Promise<void>;
  appendEvent(
    runId: string,
    type: string,
    options?: {
      message?: string;
      nodeId?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
}
// @knorvia/contracts: runtime createChildTraceContext and types
// WorkflowPhaseDefinition, ExpertWorkflowRunSnapshot. Use actual imports in draft.
declare function createChildTraceContext(
  parent: TraceContext,
  options: { attributes: Record<string, string | number | boolean>; sessionId?: string },
): TraceContext;
// ./ids.js:
declare function phaseNodeId(phase: string): string;
// ./prompts.js:
declare function buildPhasePrompt(
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
): string;
// ./runtime-context.js: ExpertWorkflowRuntimeContext type.
// ./types.js: ExpertPhaseRunResult, ExpertWorkflowRunOptions types.
// Exactly this public export; helpers private. Production types are fuller than
// this structural packet; do not replace those type declarations in production.
export declare function runPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertPhaseRunResult>;
