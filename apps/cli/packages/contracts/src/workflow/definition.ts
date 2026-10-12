// SPDX-License-Identifier: Apache-2.0
// 工作流定义的公开入口：把基础 schema 与交叉字段校验组装成 WorkflowDefinitionSchema，
// 并按 contracts-02 的 interface.md 逐个再导出兼容面名字（不用 export *，避免把内部基础
// schema 带进公开面）。声明在 definition-schemas.ts，校验实现在 definition-validation.ts。
import { z } from "zod";

import { WorkflowDefinitionBaseSchema } from "./definition-schemas.js";
import { collectWorkflowDefinitionIssues } from "./definition-validation.js";

export {
  ExpertWorkflowPhaseSchema,
  ExpertWorkflowStrategySchema,
  WorkflowGraphCollectionStatusSchema,
  WorkflowGraphSeedSourceSchema,
  WorkflowKindSchema,
  WorkflowNodeStatusSchema,
  WorkflowPhaseBehaviorSchema,
  WorkflowPhaseDefinitionSchema,
  WorkflowPhaseIdSchema,
  WorkflowRunStatusSchema,
  WorkflowStrategySchema,
} from "./definition-schemas.js";

export type {
  ExpertWorkflowPhase,
  ExpertWorkflowStrategy,
  WorkflowGraphCollectionStatus,
  WorkflowGraphSeedSource,
  WorkflowKind,
  WorkflowNodeStatus,
  WorkflowPhaseBehavior,
  WorkflowPhaseDefinition,
  WorkflowPhaseId,
  WorkflowRunStatus,
  WorkflowStrategy,
} from "./definition-schemas.js";

export const WorkflowDefinitionSchema = WorkflowDefinitionBaseSchema.superRefine(
  (definition, context) => {
    for (const issue of collectWorkflowDefinitionIssues(definition)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  },
);

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
