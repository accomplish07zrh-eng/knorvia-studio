# Version 2 functional API clarification: collection identity

The v1 packet imported the collection type without exposing its identity member. The functional API clarification is: every collection record has a required string `collectionId`; it does not declare an `id` member. `SchedulerCollection` inherits this collection identity. Entries returned by `graphCollections` use this same identity. Graph nodes still use `id`; their optional `collectionId` refers to the collection identity.

The exact public collection schema/type declaration follows. It supplies the field definition; it is not an expansion implementation or a test. Referenced schemas keep their existing imported definitions.

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

Retain all other v1 behavior/API requirements. Save a complete revised module as `output/planner-expansion-v2.ts` and record its SHA-256 and byte count in `output/draft-record-v2.json`; never overwrite v1. Record this clarification's hash, the reused v1 input/draft bindings, actual reads and any unresolved question or access violation. Freeze v2 before any implementation/history/test/review comparison, then stop. No new source/history/test/review or external access is authorized. You may use the previously allowed packet and your own v1 output. No compiler/runtime tests in this author phase.
