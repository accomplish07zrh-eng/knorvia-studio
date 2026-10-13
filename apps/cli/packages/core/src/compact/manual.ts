// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 手动压缩的公开面：兼容类型、三个常量与六个导出函数。候选筛选、轮次门槛、token
// 估算与边界装配都在 ./manual-internal.js；本模块只做参数与默认值转发。
import type * as contracts from "@knorvia/contracts";
import {
  assembleCompactBoundary,
  boundaryIdFrom,
  enoughRoundsToCompact,
  estimateTokens,
  summarizableMessages,
  usageTotalTokens,
} from "./manual-internal.js";

export interface CompactModelMessage {
  role: string;
  content: contracts.ModelMessageContent;
  toolCalls?: readonly {
    name: string;
    input: unknown;
  }[];
}

export interface TokenUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface BuildManualCompactBoundaryInput {
  autoCompactThreshold?: number;
  boundaryId: string;
  compactReason?: contracts.CompactReason;
  customInstructions?: string;
  keptMessageCount?: number;
  lastSummarizedMessageId?: contracts.MessageId;
  phase?: contracts.CompactPhase;
  postCompactTokenCount?: number;
  preservedSegment?: contracts.CompactPreservedSegment;
  preCompactTokenCount: number;
  summarizedMessageCount: number;
  summaryMessageId: contracts.MessageId;
  traceContext: contracts.TraceContext;
  trigger?: contracts.CompactTrigger;
  truePostCompactTokenCount?: number;
  willRetriggerNextTurn?: boolean;
}

export const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3;
export const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER =
  "[earlier conversation truncated for compaction retry]";
export const COMPACT_PROMPT_TOO_LONG_USER_MESSAGE =
  "Conversation too long to compact automatically. Try /compact again after narrowing the active context.";

/** 可摘要消息：去掉 system 与系统提醒，其余浅拷贝返回。 */
export function getMessagesToSummarize(
  messages: readonly CompactModelMessage[],
): CompactModelMessage[] {
  return summarizableMessages(messages);
}

/** 是否满足压缩条件：至少两轮且出现过助手消息。 */
export function hasEnoughMessagesToCompact(messages: readonly CompactModelMessage[]): boolean {
  return enoughRoundsToCompact(messages);
}

/** 组装手动压缩边界载荷（summarySource 固定 model）。 */
export function buildManualCompactBoundary(
  input: BuildManualCompactBoundaryInput,
): contracts.CompactBoundaryPayload {
  return assembleCompactBoundary(input);
}

/** 消息 token 估算（含工具调用名字与序列化入参）。 */
export function estimateMessageTokens(messages: readonly CompactModelMessage[]): number {
  return estimateTokens(messages);
}

/** 用量合计：优先 totalTokens，否则输入（含缓存读写）+ 输出。 */
export function getUsageTotalTokens(usage?: TokenUsageLike): number {
  return usageTotalTokens(usage);
}

/** 边界 id 生成：默认用 crypto.randomUUID，可注入以便测试。 */
export function createCompactBoundaryId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return boundaryIdFrom(randomUUID);
}
