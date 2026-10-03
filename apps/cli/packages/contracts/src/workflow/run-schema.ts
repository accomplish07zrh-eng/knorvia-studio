import { z } from "zod";
import {
  WorkflowPhaseIdSchema,
  WorkflowNodeStatusSchema,
  WorkflowKindSchema,
  WorkflowRunStatusSchema,
  WorkflowStrategySchema,
} from "./definition.js";
import {
  WorkflowGraphSchema,
  WorkflowGraphNodeSchema,
  WorkflowGraphEdgeSchema,
  WorkflowGraphCollectionSchema,
} from "./graph-schema.js";

export const WorkflowArtifactSchema = z.object({
  contentType: z.string(),
  createdAt: z.string(),
  label: z.string(),
  path: z.string(),
  phase: WorkflowPhaseIdSchema.optional(),
});

export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;

export const WorkflowPhaseSnapshotSchema = z.object({
  artifactPath: z.string().optional(),
  activityId: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  phase: WorkflowPhaseIdSchema,
  sessionId: z.string().optional(),
  startedAt: z.string().optional(),
  status: WorkflowNodeStatusSchema,
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});

export type WorkflowPhaseSnapshot = z.infer<typeof WorkflowPhaseSnapshotSchema>;

export const WorkflowActivityKindSchema = z.enum([
  "agent_session",
  "planner_agent",
  "subplanner_agent",
  "actor_agent",
  "critic_agent",
]);

export type WorkflowActivityKind = z.infer<typeof WorkflowActivityKindSchema>;

export const WorkflowSessionLinkStatusSchema = z.enum([
  "starting",
  "running",
  "retrying_model",
  "waiting_permission",
  "completed",
  "failed",
  "cancelled",
]);

export type WorkflowSessionLinkStatus = z.infer<typeof WorkflowSessionLinkStatusSchema>;

export const WorkflowFailureKindSchema = z.enum([
  "network",
  "rate_limit",
  "timeout",
  "auth",
  "provider",
  "model_context",
  "configuration",
  "permission",
  "tool",
  "cancelled",
  "unknown",
]);

export type WorkflowFailureKind = z.infer<typeof WorkflowFailureKindSchema>;

export const WorkflowFailureSchema = z.object({
  activityId: z.string().optional(),
  code: z.string().optional(),
  kind: WorkflowFailureKindSchema,
  message: z.string(),
  nodeId: z.string().optional(),
  phase: WorkflowPhaseIdSchema.optional(),
  recoverable: z.boolean(),
  retryable: z.boolean(),
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});

export type WorkflowFailure = z.infer<typeof WorkflowFailureSchema>;

export const WorkflowRecoveryActionSchema = z.object({
  action: z.enum(["retry", "retry_with_current_model", "skip_node", "cancel"]),
  activityId: z.string().optional(),
  destructive: z.boolean().optional(),
  label: z.string(),
  nodeId: z.string().optional(),
  phase: WorkflowPhaseIdSchema.optional(),
});

export type WorkflowRecoveryAction = z.infer<typeof WorkflowRecoveryActionSchema>;

export const WorkflowSessionLinkSchema = z.object({
  activityId: z.string(),
  attempt: z.number().int().positive(),
  completedAt: z.string().optional(),
  kind: WorkflowActivityKindSchema,
  model: z.string().optional(),
  nodeId: z.string().optional(),
  parentSessionId: z.string().optional(),
  phase: WorkflowPhaseIdSchema,
  runId: z.string(),
  sessionId: z.string().optional(),
  startedAt: z.string(),
  status: WorkflowSessionLinkStatusSchema,
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});

export type WorkflowSessionLink = z.infer<typeof WorkflowSessionLinkSchema>;

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

export const ExpertWorkflowRunSnapshotSchema = WorkflowRunSnapshotSchema;

export type ExpertWorkflowRunSnapshot = WorkflowRunSnapshot;

export const WorkflowEventTypeSchema = z.enum([
  "run_started",
  "run_completed",
  "run_failed",
  "workflow_paused",
  "workflow_retry_started",
  "workflow_session_linked",
  "run_cancelled",
  "phase_started",
  "phase_completed",
  "phase_failed",
  "artifact_written",
  "graph_updated",
  "node_started",
  "node_completed",
  "node_failed",
  "frontier_changed",
  "executor_paused",
  "executor_completed",
  "planner_started",
  "planner_completed",
  "planner_failed",
  "graph_expanded",
  "collection_exhausted",
  "critic_started",
  "critic_passed",
  "critic_failed",
  "node_reopened",
  "critic_iteration_limit_reached",
]);

export type WorkflowEventType = z.infer<typeof WorkflowEventTypeSchema>;

export const WorkflowEventSchema = z.object({
  kind: WorkflowKindSchema,
  message: z.string().optional(),
  nodeId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  phase: WorkflowPhaseIdSchema.optional(),
  runId: z.string(),
  timestamp: z.string(),
  type: WorkflowEventTypeSchema,
});

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

export const WorkflowGraphRecordSchema = z.discriminatedUnion("recordType", [
  z.object({
    recordType: z.literal("meta"),
    createdAt: z.string(),
    definitionId: z.string().min(1).optional(),
    definitionVersion: z.string().min(1).optional(),
    phaseOrder: z.array(WorkflowPhaseIdSchema),
    runId: z.string(),
    schemaVersion: z.literal(1),
    strategy: WorkflowStrategySchema,
  }),
  z.object({
    recordType: z.literal("node"),
    node: WorkflowGraphNodeSchema,
    runId: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    recordType: z.literal("edge"),
    edge: WorkflowGraphEdgeSchema,
    runId: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    recordType: z.literal("collection"),
    collection: WorkflowGraphCollectionSchema,
    runId: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    collectionId: z.string().optional(),
    edgeIds: z.array(z.string()).optional(),
    recordType: z.literal("op"),
    nodeId: z.string().optional(),
    nodeIds: z.array(z.string()).optional(),
    phase: WorkflowPhaseIdSchema.optional(),
    payload: z.record(z.unknown()).optional(),
    runId: z.string(),
    status: WorkflowNodeStatusSchema.optional(),
    timestamp: z.string(),
    type: z.string(),
  }),
]);

export type WorkflowGraphRecord = z.infer<typeof WorkflowGraphRecordSchema>;
