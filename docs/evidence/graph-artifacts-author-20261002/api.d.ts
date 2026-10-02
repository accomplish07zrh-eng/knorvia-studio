// Minimal structural declarations. No dependency implementation bodies.
interface WorkflowGraphNode {
  id: string;
  [key: string]: unknown;
}
interface WorkflowGraphEdge {
  from: string;
  to: string;
}
interface WorkflowGraphCollection {
  collectionId: string;
  [key: string]: unknown;
}
interface ExpertWorkflowRunSnapshot {
  runId: string;
  [key: string]: unknown;
}
interface WorkflowPhaseDefinition {
  phase: string;
  title: string;
  seedGraphFromArtifact?: { targetPhase: string; gateAfterPhase?: string };
  nodePromptsFromArtifact?: { targetPhase: string };
}
interface WorkflowGraphSeed {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  collections: WorkflowGraphCollection[];
}
interface WorkflowNodePromptUpdate {
  id: string;
  prompt?: string;
  title?: string;
  description?: string;
}
interface ApplyWorkflowGraphSeedResult<T> {
  addedCollections: WorkflowGraphCollection[];
  addedEdges: WorkflowGraphEdge[];
  addedNodes: WorkflowGraphNode[];
  changed: boolean;
  snapshot: T;
}
interface ApplyWorkflowNodePromptUpdatesResult<T> {
  changed: boolean;
  snapshot: T;
  updatedNodes: WorkflowGraphNode[];
}
interface ExpertWorkflowRuntimeContext {
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
  timestamp(): string;
  appendEvent(
    runId: string,
    type: "graph_expanded" | "graph_updated",
    options: {
      message?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
}
// Runtime imports from ../lifecycle.js:
declare function applyWorkflowGraphSeed<T extends ExpertWorkflowRunSnapshot>(
  snapshot: T,
  seed: WorkflowGraphSeed,
  options: { phase?: string; timestamp: string },
): ApplyWorkflowGraphSeedResult<T>;
declare function applyWorkflowNodePromptUpdates<T extends ExpertWorkflowRunSnapshot>(
  snapshot: T,
  updates: readonly WorkflowNodePromptUpdate[],
  options: { phase: string; timestamp: string },
): ApplyWorkflowNodePromptUpdatesResult<T>;
// Runtime imports from ./ids.js:
declare function edgeId(edge: WorkflowGraphEdge): string;
declare function phaseNodeId(phase: string): string;
// Runtime imports from ./parsers/graph-seed.js:
declare function parseWorkflowGraphSeed(
  response: string,
  defaultPhase: string,
): WorkflowGraphSeed | null;
declare function gateRootSeedNodes(seed: WorkflowGraphSeed, gateNodeId: string): WorkflowGraphSeed;
// Runtime import from ./parsers/node-prompts.js:
declare function parseWorkflowNodePromptUpdateSet(
  response: string,
): { nodes: WorkflowNodePromptUpdate[]; reasoning?: string } | null;
// In production import context type from ./runtime-context.js and snapshot/phase
// types from @knorvia/contracts. Result type may be imported from ../lifecycle.js.
// Preserve precisely these two public signatures/exports; all helpers private.
export declare function seedGraphFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot>;
export declare function updateNodePromptsFromPhaseArtifact(
  ctx: ExpertWorkflowRuntimeContext,
  snapshot: ExpertWorkflowRunSnapshot,
  definition: WorkflowPhaseDefinition,
  response: string,
  signal?: AbortSignal,
): Promise<ExpertWorkflowRunSnapshot>;
