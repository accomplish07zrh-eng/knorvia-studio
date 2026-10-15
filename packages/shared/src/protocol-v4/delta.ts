// SPDX-License-Identifier: Apache-2.0
// ConversationDelta：会话增量的五个操作，封闭集合（B28/B29）。
// 没有 row.inserted、没有 row.moved、没有字段级 JSON patch——凡此模型表达不了的结构变化，
// 服务端一律发 snapshot resync，刻意压缩客户端错误面。
import { z } from "zod";
import { streamablePathSchema } from "./core.js";
import { conversationRowSchema } from "./rows.js";
import { sharedContextImportStateSchema } from "./shared-context-import.js";
import {
  backgroundWorkSummarySchema,
  commandStateSummarySchema,
  goalStateSchema,
  inputRoutingSchema,
  pendingInteractionSchema,
  planStateSchema,
  queueStateSchema,
  sessionActionAvailabilitySchema,
  sessionConfigStateSchema,
  sessionControlSchema,
  sessionMetaStateSchema,
  sessionModelTransitionSchema,
  sessionUsageStateSchema,
  subagentProjectionStateSchema,
  workspaceHookAdmissionStateSchema,
} from "./snapshot.js";
import { workflowRunsStateSchema } from "./workflow-runs.js";

// StatePatch：键级整体替换（Object.assign），键集合封闭、键内绝不深合并。该对象非 strict——
// 未知键被剥离而不是报错（以旧实现为准），下游按封闭集消费。
export const statePatchSchema = z.object({
  revision: z.number().optional(),
  control: sessionControlSchema.optional(),
  sharedContextImport: sharedContextImportStateSchema.optional(),
  availability: sessionActionAvailabilitySchema.optional(),
  inputRouting: inputRoutingSchema.optional(),
  meta: sessionMetaStateSchema.optional(),
  config: sessionConfigStateSchema.optional(),
  modelTransition: sessionModelTransitionSchema.nullable().optional(),
  usage: sessionUsageStateSchema.optional(),
  queue: queueStateSchema.optional(),
  pendingInteractions: z.array(pendingInteractionSchema).optional(),
  pendingCommands: z.array(commandStateSummarySchema).optional(),
  backgroundWorks: z.array(backgroundWorkSummarySchema).optional(),
  subagents: subagentProjectionStateSchema.optional(),
  // workflow run 的实时运行态。容器本身不 strict，旧桌面收到这个新键只是剥离一个键。
  workflowRuns: workflowRunsStateSchema.optional(),
  goal: goalStateSchema.nullable().optional(),
  plan: planStateSchema.nullable().optional(),
  // 软门禁：null = pending 清零；对象 = 待审核状态更新。
  workspaceHookAdmission: workspaceHookAdmissionStateSchema.nullable().optional(),
});
export type StatePatch = z.infer<typeof statePatchSchema>;

export const conversationDeltaSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("row.appended"), row: conversationRowSchema }),
  z.object({ op: z.literal("row.upserted"), row: conversationRowSchema }),
  // 删除该行及之后所有行（edit/retry 分支），作用于 rowId >= fromRowId 的已加载集合。
  z.object({ op: z.literal("row.removed"), fromRowId: z.number() }),
  // 流式文本追加，仅允许作用于流式态行（服务端保证）。
  z.object({
    op: z.literal("row.delta"),
    rowId: z.number(),
    path: streamablePathSchema,
    append: z.string(),
  }),
  z.object({ op: z.literal("state.updated"), patch: statePatchSchema }),
]);
export type ConversationDelta = z.infer<typeof conversationDeltaSchema>;
