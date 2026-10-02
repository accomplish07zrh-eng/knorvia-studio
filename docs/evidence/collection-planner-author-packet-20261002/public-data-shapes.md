# Public workflow data shapes

Exact public schema/type excerpts; referenced schema definitions remain existing dependencies. Collection identity is `collectionId`; graph node identity is `id`. These are data contracts, not planner behavior implementations.

```ts
export const WorkflowArtifactSchema = z.object({
  contentType: z.string(),
  createdAt: z.string(),
  label: z.string(),
  path: z.string(),
  phase: WorkflowPhaseIdSchema.optional(),
});
export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;
```

```ts
export const WorkflowActivitySnapshotSchema = z.object({
  activityId: z.string(),
  artifactPath: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  inputArtifactPaths: z.array(z.string()).default([]),
  kind: WorkflowActivityKindSchema,
  model: z.string().optional(),
  nodeId: z.string().optional(),
  outputArtifactPaths: z.array(z.string()).default([]),
  parentSessionId: z.string().optional(),
  phase: WorkflowPhaseIdSchema,
  sessionId: z.string().optional(),
  startedAt: z.string(),
  status: WorkflowNodeStatusSchema,
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});
export type WorkflowActivitySnapshot = z.infer<typeof WorkflowActivitySnapshotSchema>;
```

```ts
export const WorkflowGraphCollectionSchema = z.object({
  analyzedNodeIds: z.array(z.string()).optional(),
  collectionId: z.string(),
  errorCount: z.number().int().nonnegative().optional(),
  exhausted: z.boolean().optional(),
  explorable: z.boolean().optional(),
  frontierTarget: z.number().int().positive().optional(),
  goal: z.string().optional(),
  lastCompletionAt: z.string().optional(),
  lastGraphChangeAt: z.string().optional(),
  metric: z.string().optional(),
  nodeIds: z.array(z.string()).optional(),
  phase: WorkflowPhaseIdSchema.optional(),
  plannerRuns: z.number().int().nonnegative().optional(),
  status: WorkflowGraphCollectionStatusSchema.optional(),
  title: z.string().optional(),
});
export type WorkflowGraphCollection = z.infer<typeof WorkflowGraphCollectionSchema>;
```

```ts
export const WorkflowGraphPlannerResultSchema = z.object({
  collectionNodeIds: z.array(z.string()).optional(),
  edges: z.array(WorkflowGraphEdgeSchema).default([]),
  exhausted: z.boolean().optional(),
  nodes: z.array(WorkflowGraphPlannerNodeSchema).default([]),
  reasoning: z.string().optional(),
});
export type WorkflowGraphPlannerResult = z.infer<typeof WorkflowGraphPlannerResultSchema>;
```

```ts
export const WorkflowRunSnapshotSchema = z.object({
  activities: z.array(WorkflowActivitySnapshotSchema).default([]),
  artifacts: z.array(WorkflowArtifactSchema),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  currentPhase: WorkflowPhaseIdSchema.optional(),
  cwd: z.string(),
  definitionId: z.string().min(1).optional(),
  definitionVersion: z.string().min(1).optional(),
  graph: WorkflowGraphSchema,
  kind: WorkflowKindSchema,
  phaseOrder: z.array(WorkflowPhaseIdSchema),
  phases: z.array(WorkflowPhaseSnapshotSchema),
  failure: WorkflowFailureSchema.optional(),
  pauseReason: z.string().optional(),
  reportPath: z.string().optional(),
  recoveryActions: z.array(WorkflowRecoveryActionSchema).default([]),
  runId: z.string(),
  schemaVersion: z.literal(1),
  sessionId: z.string().optional(),
  sessionLinks: z.array(WorkflowSessionLinkSchema).default([]),
  startedAt: z.string().optional(),
  status: WorkflowRunStatusSchema,
  strategy: WorkflowStrategySchema,
  task: z.string(),
  traceId: z.string().optional(),
  updatedAt: z.string(),
});
export type WorkflowRunSnapshot = z.infer<typeof WorkflowRunSnapshotSchema>;
```

The executor strategy exposes numeric `frontierTarget`, `maxPlannerRuns`, and `maxConsecutiveErrors`. `TraceContext` exposes `traceId` and optional `sessionId`; pass it through the public factory, never generate identifiers here. Graph nodes expose string `id` and status.
