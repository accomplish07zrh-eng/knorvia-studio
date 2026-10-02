# Public workflow field shapes

This is source-derived schema/API information, not implementation. Types imported from @knorvia/contracts are the production authority. Only relevant fields are enumerated here; other public snapshot metadata is preserved by shallow spread. Unlike branded tracing IDs in unrelated APIs, these workflow schema string fields are plain strings.

```ts
type WorkflowNodeStatus = "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
type WorkflowGraphEdge = { from: string; to: string };
type WorkflowGraphNode = {
  collectionId?: string; id: string; attempts?: number; dependsOn: string[];
  description?: string; error?: string; kind: "phase" | "task"; phase?: string;
  prompt?: string; reopenAttempts?: number; status: WorkflowNodeStatus; title: string;
};
type WorkflowGraphCollection = {
  analyzedNodeIds?: string[]; collectionId: string; errorCount?: number; exhausted?: boolean;
  explorable?: boolean; frontierTarget?: number; goal?: string; lastCompletionAt?: string;
  lastGraphChangeAt?: string; metric?: string; nodeIds?: string[]; phase?: string;
  plannerRuns?: number; status?: "active" | "draining" | "exhausted"; title?: string;
};
type WorkflowGraph = { collections?: WorkflowGraphCollection[]; edges: WorkflowGraphEdge[]; nodes: WorkflowGraphNode[] };
type WorkflowPhaseSnapshot = {
  artifactPath?: string; activityId?: string; completedAt?: string; error?: string;
  phase: string; sessionId?: string; startedAt?: string; status: WorkflowNodeStatus;
  traceId?: string; turnId?: string;
};
type WorkflowActivityKind = "agent_session" | "planner_agent" | "subplanner_agent" | "actor_agent" | "critic_agent";
type WorkflowActivitySnapshot = {
  activityId: string; artifactPath?: string; completedAt?: string; error?: string;
  inputArtifactPaths: string[]; kind: WorkflowActivityKind; model?: string; nodeId?: string;
  outputArtifactPaths: string[]; parentSessionId?: string; phase: string; sessionId?: string;
  startedAt: string; status: WorkflowNodeStatus; traceId?: string; turnId?: string;
};
type WorkflowGraphPlannerNode = {
  collectionId?: string; dependsOn: string[]; description?: string; id: string;
  kind: "phase" | "task"; phase?: string; prompt?: string; title: string;
};
type WorkflowGraphSeedCollection = {
  collectionId: string; explorable?: boolean; frontierTarget?: number; goal?: string;
  metric?: string; nodeIds: string[]; phase?: string; title?: string;
};
type WorkflowGraphSeed = {
  collections: WorkflowGraphSeedCollection[]; edges: WorkflowGraphEdge[];
  nodes: WorkflowGraphPlannerNode[]; reasoning?: string;
};
type WorkflowNodePromptUpdate = { description?: string; id: string; prompt?: string; title?: string };
type WorkflowStrategy = {
  clarify: { confidenceThreshold: number; maxRounds: number; minRounds: number };
  executor: { drainingChangeHours: number; frontierTarget: number; maxConcurrentLoops: number;
    maxConsecutiveErrors: number; maxPlannerRuns: number };
  finalCritic: { maxIterations: number }; reactLoop: { maxRounds: number };
};
type WorkflowPhaseDefinition = {
  artifactPath?: string; behavior: "agent" | "scheduled_graph" | "critic" | "complete";
  description: string; nodePromptsFromArtifact?: { targetPhase: string }; phase: string;
  seedGraphFromArtifact?: { gateAfterPhase?: string; targetPhase: string }; title: string;
};
type WorkflowDefinition = {
  definitionId: string; definitionVersion: string; description?: string; kind: string;
  phaseOrder: string[]; phases: WorkflowPhaseDefinition[]; strategy: WorkflowStrategy; title: string;
};
```

WorkflowRunSnapshot has required activities[], artifacts[], createdAt,cwd,graph,kind,phaseOrder[],phases[],recoveryActions[],runId,schemaVersion=1,sessionLinks[],status,strategy,task,updatedAt; optional completedAt,currentPhase,definitionId,definitionVersion,failure,pauseReason,reportPath,sessionId,startedAt,traceId. Run status union is pending,running,paused,completed,failed,cancelled. WorkflowSessionLink[] is opaque here and comes from the public deriveWorkflowSessionLinks collaborator; no lifecycle owner should recreate or modify its elements. Generic TSnapshot can carry additional caller fields which survive projections.

Seed/parser inputs can be normalized by public schema parse: node dependsOn defaults [], node kind defaults task; seed collections/edges/nodes and collection nodeIds default []. Actual schema parsing remains the collaborator's responsibility, including empty/unknown-field behavior and exact schema errors; author must use the parsed result.
