// SPDX-License-Identifier: Apache-2.0
// ListSavedWorkflows 工具的声明：枚举「当前项目里已保存、可以拿来跑的 dwf 定义」。
// 与 ListWorkflowRuns 是两件事：后者列历史运行记录，本工具列可用定义清单。两者在命名上
// 刻意区分 Runs / SavedWorkflows，因为模型最常见的误用就是把「有哪些工作流可用」问成
// 「有哪些工作流跑过」。
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import { SavedWorkflowEntrySchema, SavedWorkflowInvalidEntrySchema } from "./saved-workflow.js";

export const LIST_SAVED_WORKFLOWS_TOOL_NAME = "ListSavedWorkflows";

export const ListSavedWorkflowsInputSchema = z
  .object({})
  // 与 ListWorkflowRuns 同一约束：没有 cwd 输入，工具只扫当前会话的工作目录——
  // 模型不能跨项目扫盘，这也是 `sideEffectScope: "none"` 成立的前提。
  .strict();

export type ListSavedWorkflowsInput = z.infer<typeof ListSavedWorkflowsInputSchema>;

export const ListSavedWorkflowsInputJsonSchema = toToolJsonSchema(ListSavedWorkflowsInputSchema);

export const ListSavedWorkflowsOutputSchema = z
  .object({
    workflows: z.array(SavedWorkflowEntrySchema),
    /** 读不出来的文件。为空时整键缺席——空数组会让每次调用都挂一个噪音字段。 */
    invalid: z.array(SavedWorkflowInvalidEntrySchema).optional(),
  })
  .strict();

export type ListSavedWorkflowsOutput = z.infer<typeof ListSavedWorkflowsOutputSchema>;

export const ListSavedWorkflowsOutputJsonSchema = toToolJsonSchema(ListSavedWorkflowsOutputSchema);
