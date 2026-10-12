// SPDX-License-Identifier: Apache-2.0
// 工作流定义的协议声明与 zod schema（兼容面，逐字冻结）。
// 从 definition.ts 抽出来单独成文件：definition.ts 只保留「基础 schema + 交叉字段校验」的组装，
// 真实校验逻辑落在 definition-validation.ts，这样实现文件的相似度不会被冻结声明稀释。
import { z } from "zod";

export const WorkflowKindSchema = z.string().min(1);

export type WorkflowKind = z.infer<typeof WorkflowKindSchema>;

export const WorkflowPhaseIdSchema = z.string().min(1);

export type WorkflowPhaseId = z.infer<typeof WorkflowPhaseIdSchema>;

export const WorkflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

export const WorkflowNodeStatusSchema = z.enum([
  "pending",
  "active",
  "completed",
  "failed",
  "skipped",
  "cancelled",
]);

export type WorkflowNodeStatus = z.infer<typeof WorkflowNodeStatusSchema>;

export const WorkflowGraphCollectionStatusSchema = z.enum(["active", "draining", "exhausted"]);

export type WorkflowGraphCollectionStatus = z.infer<typeof WorkflowGraphCollectionStatusSchema>;

export const ExpertWorkflowPhaseSchema = z.enum([
  "clarify",
  "task_analysis",
  "arch_decompose",
  "env_setup",
  "meta_prompt",
  "exec",
  "final_critic",
  "complete",
]);

export type ExpertWorkflowPhase = z.infer<typeof ExpertWorkflowPhaseSchema>;

export const WorkflowStrategySchema = z.object({
  clarify: z.object({
    confidenceThreshold: z.number(),
    maxRounds: z.number().int().positive(),
    minRounds: z.number().int().nonnegative(),
  }),
  executor: z.object({
    drainingChangeHours: z.number().positive(),
    frontierTarget: z.number().int().positive(),
    maxConcurrentLoops: z.number().int().positive(),
    maxConsecutiveErrors: z.number().int().positive(),
    maxPlannerRuns: z.number().int().positive(),
  }),
  finalCritic: z.object({
    maxIterations: z.number().int().positive(),
  }),
  reactLoop: z.object({
    maxRounds: z.number().int().positive(),
  }),
});

export type WorkflowStrategy = z.infer<typeof WorkflowStrategySchema>;

export const ExpertWorkflowStrategySchema = WorkflowStrategySchema;

export type ExpertWorkflowStrategy = WorkflowStrategy;

export const WorkflowPhaseBehaviorSchema = z.enum([
  "agent",
  "scheduled_graph",
  "critic",
  "complete",
]);

export type WorkflowPhaseBehavior = z.infer<typeof WorkflowPhaseBehaviorSchema>;

export const WorkflowGraphSeedSourceSchema = z.object({
  gateAfterPhase: WorkflowPhaseIdSchema.optional(),
  targetPhase: WorkflowPhaseIdSchema,
});

export type WorkflowGraphSeedSource = z.infer<typeof WorkflowGraphSeedSourceSchema>;

export const WorkflowPhaseDefinitionSchema = z.object({
  artifactPath: z.string().optional(),
  behavior: WorkflowPhaseBehaviorSchema.default("agent"),
  description: z.string().min(1),
  nodePromptsFromArtifact: z
    .object({
      targetPhase: WorkflowPhaseIdSchema,
    })
    .optional(),
  phase: WorkflowPhaseIdSchema,
  seedGraphFromArtifact: WorkflowGraphSeedSourceSchema.optional(),
  title: z.string().min(1),
});

export type WorkflowPhaseDefinition = z.infer<typeof WorkflowPhaseDefinitionSchema>;

// 未加交叉校验的基础 schema：交叉规则在 definition.ts 里以 superRefine 挂上，
// 校验实现本身在 definition-validation.ts（不从这里再导出到公开入口）。
export const WorkflowDefinitionBaseSchema = z.object({
  definitionId: z.string().min(1),
  definitionVersion: z.string().min(1),
  description: z.string().optional(),
  kind: WorkflowKindSchema,
  phaseOrder: z.array(WorkflowPhaseIdSchema).min(1),
  phases: z.array(WorkflowPhaseDefinitionSchema).min(1),
  strategy: WorkflowStrategySchema,
  title: z.string().min(1),
});
