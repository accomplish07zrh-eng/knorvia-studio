# Public data shape references

The schema excerpts are existing public contract declarations, not owner implementations or schemas to reimplement. Referenced unrelated workflow/tracing names retain existing definitions. TraceId, QueryId, SessionId and TurnId are existing string aliases.

```ts
export const WorkflowNodeStatusSchema = z.enum([
    "pending",
    "active",
    "completed",
    "failed",
    "skipped",
    "cancelled",
]);
```

```ts
export const WorkflowActivityKindSchema = z.enum([
    "agent_session",
    "planner_agent",
    "subplanner_agent",
    "actor_agent",
    "critic_agent",
]);
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

