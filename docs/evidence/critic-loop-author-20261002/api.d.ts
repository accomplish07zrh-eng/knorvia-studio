// Structural aid only. Import real production types at the named paths.
interface WorkflowPhaseDefinition {
  phase: string;
  behavior: string;
  title: string;
}
interface WorkflowCriticReopenProposal {
  nodeId: string;
  reason: string;
  severity?: string;
}
interface WorkflowCriticResult {
  verdict: "pass" | "fail";
  reasoning: string;
  acceptanceGaps: string[];
  reopenProposals: WorkflowCriticReopenProposal[];
}
interface Node {
  id: string;
  kind: string;
  error?: string;
  status: string;
  [key: string]: unknown;
}
interface ExpertWorkflowRunSnapshot {
  runId: string;
  currentPhase?: string;
  updatedAt: string;
  strategy: { finalCritic: { maxIterations: number } };
  graph: { collections?: unknown[]; edges: unknown[]; nodes: Node[] };
  phases: { phase: string; status: string; [key: string]: unknown }[];
  [key: string]: unknown;
}
interface ExpertWorkflowRunOptions {
  abortSignal?: AbortSignal;
  cwd: string;
  task: string;
}
interface ExpertWorkflowRuntimeContext {
  definition: { title: string; phases: WorkflowPhaseDefinition[] };
  timestamp(): string;
  updatePhase(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    patch: { completedAt?: string; error?: string; status?: string },
  ): ExpertWorkflowRunSnapshot;
  appendGraphStatus(
    snapshot: ExpertWorkflowRunSnapshot,
    phase: string,
    status: string,
    signal?: AbortSignal,
  ): Promise<void>;
  appendEvent(
    runId: string,
    type: string,
    options: {
      message?: string;
      payload?: Record<string, unknown>;
      nodeId?: string;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
  store: {
    writeSnapshot(
      snapshot: ExpertWorkflowRunSnapshot,
      options?: { signal?: AbortSignal },
    ): Promise<void>;
    appendGraphRecord(
      runId: string,
      record: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<void>;
  };
}
// @knorvia/contracts types: ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition,
// WorkflowCriticReopenProposal. ./runtime-context.js type ExpertWorkflowRuntimeContext.
// ./types.js type ExpertWorkflowRunOptions.
// ../lifecycle.js:
declare function reopenWorkflowGraphNode(
  snapshot: ExpertWorkflowRunSnapshot,
  options: { maxReopens: number; nodeId: string; reason: string; timestamp: string },
): { reopenAttempts: number; snapshot: ExpertWorkflowRunSnapshot };
// ./ids.js:
declare function phaseNodeId(phase: string): string;
// ./parsers/critic.js:
declare function parseCriticResult(response: string): WorkflowCriticResult;
declare function dedupeReopenProposals(
  proposals: readonly WorkflowCriticReopenProposal[],
): WorkflowCriticReopenProposal[];
// ./phase-runner.js:
declare function runPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<{ response: string; snapshot: ExpertWorkflowRunSnapshot }>;
// ./scheduled-phase.js:
declare function runScheduledPhase(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot>;
export declare function runFinalCriticLoop(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot>;
