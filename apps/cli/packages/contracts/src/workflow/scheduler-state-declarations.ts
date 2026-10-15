// SPDX-License-Identifier: Apache-2.0
// 调度器状态的协议声明与 zod schema（兼容面，逐字冻结；纯声明模块，计分走声明模式）。
// 推导实现在 scheduler-state-derivation.ts，scheduler-state.ts 只做再导出。
import { z } from "zod";
import {
  WorkflowGraphNodeSchema,
  WorkflowGraphCollectionSchema,
} from "./graph-schema-declarations.js";
import {
  WorkflowGraphCollectionStatusSchema,
  WorkflowPhaseIdSchema,
} from "./definition-schemas.js";

export const WorkflowSchedulerDerivedNodeSchema = z.object({
  blockedBy: z.array(z.string()),
  collectionIds: z.array(z.string()).default([]),
  incoming: z.array(z.string()),
  node: WorkflowGraphNodeSchema,
  outgoing: z.array(z.string()),
  ready: z.boolean(),
});

export type WorkflowSchedulerDerivedNode = z.infer<typeof WorkflowSchedulerDerivedNodeSchema>;

export const WorkflowSchedulerCollectionStateSchema = z.object({
  activeNodeIds: z.array(z.string()),
  collection: WorkflowGraphCollectionSchema,
  completedNodeIds: z.array(z.string()),
  errorCount: z.number().int().nonnegative(),
  exhausted: z.boolean(),
  failedNodeIds: z.array(z.string()),
  frontier: z.number().int().nonnegative(),
  frontierTarget: z.number().int().positive().optional(),
  pendingNodeIds: z.array(z.string()),
  plannerRuns: z.number().int().nonnegative(),
  readyNodeIds: z.array(z.string()),
  status: WorkflowGraphCollectionStatusSchema,
});

export type WorkflowSchedulerCollectionState = z.infer<
  typeof WorkflowSchedulerCollectionStateSchema
>;

export const WorkflowSchedulerActiveActivitySchema = z.object({
  activityId: z.string(),
  nodeId: z.string().optional(),
  phase: WorkflowPhaseIdSchema,
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  turnId: z.string().optional(),
});

export type WorkflowSchedulerActiveActivity = z.infer<typeof WorkflowSchedulerActiveActivitySchema>;

export const WorkflowSchedulerStateSchema = z.object({
  activeActivities: z.array(WorkflowSchedulerActiveActivitySchema),
  activeChildSessionIds: z.array(z.string()),
  activeNodeIds: z.array(z.string()),
  blockedNodes: z.array(
    z.object({
      blockedBy: z.array(z.string()),
      nodeId: z.string(),
    }),
  ),
  counts: z.object({
    active: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  collectionStates: z.array(WorkflowSchedulerCollectionStateSchema).default([]),
  nodes: z.array(WorkflowSchedulerDerivedNodeSchema),
  readyNodeIds: z.array(z.string()),
});

export type WorkflowSchedulerState = z.infer<typeof WorkflowSchedulerStateSchema>;
