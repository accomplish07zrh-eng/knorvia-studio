// SPDX-License-Identifier: Apache-2.0
// sessions-index：侧栏列表的活性数据源（conflated 最新态，永不溢出）。topic 键的构造与解析
// 是一对互逆函数（B38）；快照/增量与 summary schema 见 B39。
import { z } from "zod";
import { timestampSchema } from "./core.js";
import { sessionWorkflowActivitySchema } from "./sessions-index-workflow-activity.js";
import {
  goalStateSchema,
  interactionAutoResolutionSchema,
  sessionMetaStateSchema,
  sessionPhaseSchema,
} from "./snapshot.js";

/** sessions-index topic 键的固定前缀；构造与解析共用，避免两处漂移。 */
const INDEX_TOPIC_PREFIX = "sessions-index/";

export const sessionPendingInteractionSummarySchema = z.object({
  interactionId: z.string(),
  kind: z.enum(["permission", "userInput"]),
  // 只下发轻量工具身份，侧栏据此区分 AskUserQuestion 与其他阻塞确认；不携带问题或答案。
  toolName: z.string().optional(),
  autoResolution: interactionAutoResolutionSchema.optional(),
});
export type SessionPendingInteractionSummary = z.infer<
  typeof sessionPendingInteractionSummarySchema
>;

export const pendingInteractionSummarySchema = z.object({
  permissionCount: z.number().int().nonnegative(),
  userInputCount: z.number().int().nonnegative(),
});
export type PendingInteractionSummary = z.infer<typeof pendingInteractionSummarySchema>;

export const sessionSummarySchema = z.object({
  sessionId: z.string(),
  workspaceId: z.string(),
  parentSessionId: z.string().optional(),
  title: z.string(),
  // custom = 用户显式重命名；optional 兼容旧 frame / 旧持久化摘要。
  titleSource: sessionMetaStateSchema.shape.titleSource.optional(),
  phase: sessionPhaseSchema,
  sessionEnded: z.boolean(),
  hasBackgroundWork: z.boolean(),
  // 侧栏工作流运行行：有界 run 摘要，会话没有任何 run 时缺席；optional 兼容旧 frame。
  workflowActivity: sessionWorkflowActivitySchema.optional(),
  pendingInteraction: sessionPendingInteractionSummarySchema.optional(),
  // 侧栏只需 kind/count，不下发问题、命令或答案等敏感 payload。
  pendingInteractionSummary: pendingInteractionSummarySchema.optional(),
  goalStatus: goalStateSchema.shape.status.optional(),
  // 未读推导：客户端本地记 lastSeenActivityAt 比较（不用 seq，epoch 会重置）。
  lastActivityAt: timestampSchema,
  lastAssistantPreview: z.string().optional(),
  createdAt: timestampSchema,
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionsIndexSnapshotSchema = z.object({
  protocolVersion: z.literal(1),
  workspaceId: z.string(),
  // host 级列表日志代际（与各 session 的 logEpoch 无关）。
  logEpoch: z.string(),
  // 无序；排序是客户端展示逻辑。
  sessions: z.array(sessionSummarySchema),
});
export type SessionsIndexSnapshot = z.infer<typeof sessionsIndexSnapshotSchema>;

export const sessionsIndexDeltaSchema = z.discriminatedUnion("op", [
  // conflation key = sessionId。
  z.object({ op: z.literal("session.upserted"), session: sessionSummarySchema }),
  z.object({ op: z.literal("session.removed"), sessionId: z.string() }),
]);
export type SessionsIndexDelta = z.infer<typeof sessionsIndexDeltaSchema>;

/** 构造 sessions-index topic 键（与 parseSessionsIndexTopic 对偶）。 */
export function sessionsIndexTopic(workspaceId: string): string {
  return INDEX_TOPIC_PREFIX + workspaceId;
}

/** 解析 "sessions-index/<workspaceId>"；前缀不符或空 id 返回 null（空 id 不算）。 */
export function parseSessionsIndexTopic(topic: string): string | null {
  if (!topic.startsWith(INDEX_TOPIC_PREFIX)) return null;
  const identifier = topic.slice(INDEX_TOPIC_PREFIX.length);
  return identifier === "" ? null : identifier;
}
