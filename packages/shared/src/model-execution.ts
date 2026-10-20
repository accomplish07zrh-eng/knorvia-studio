// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/* 文本与附件发送共用的单次执行约束：凭据只属于这一次执行，不进入 Session 配置。 */

const nonEmptyText = z.string().min(1);

const requestAuthSchema = z.strictObject({
  apiKey: nonEmptyText.optional(),
  headers: z.record(nonEmptyText, nonEmptyText).optional(),
});

const subagentPolicySchema = z.strictObject({
  foregroundModel: z.literal("submission"),
  background: z.literal("deny"),
});

export const modelExecutionSchema = z.strictObject({
  memoryExtraction: z.literal("skip").optional(),
  selectionScope: z.literal("execution"),
  requestAuth: requestAuthSchema.optional(),
  subagents: subagentPolicySchema.optional(),
});
