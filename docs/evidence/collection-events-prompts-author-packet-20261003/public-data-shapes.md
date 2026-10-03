# Public data shape references

Existing public schema/type references only; import these existing contracts rather than reconstructing schemas. Other referenced workflow names keep their existing definitions.

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
```

```ts
export const WorkflowGraphCollectionStatusSchema = z.enum(["active", "draining", "exhausted"]);
```

```ts
export const WorkflowGraphNodeSchema = z.object({
    collectionId: z.string().optional(),
    id: z.string(),
    attempts: z.number().int().nonnegative().optional(),
    dependsOn: z.array(z.string()).default([]),
    description: z.string().optional(),
    error: z.string().optional(),
    kind: z.enum(["phase", "task"]).default("phase"),
    phase: WorkflowPhaseIdSchema.optional(),
    prompt: z.string().optional(),
    reopenAttempts: z.number().int().nonnegative().optional(),
    status: WorkflowNodeStatusSchema,
    title: z.string(),
});
```

```ts
export const WorkflowArtifactSchema = z.object({
    contentType: z.string(),
    createdAt: z.string(),
    label: z.string(),
    path: z.string(),
    phase: WorkflowPhaseIdSchema.optional(),
});
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
```

