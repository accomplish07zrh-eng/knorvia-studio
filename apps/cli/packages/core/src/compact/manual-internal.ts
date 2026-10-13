// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 手动压缩的计算模块：摘要候选筛选、轮次门槛、token 估算、用量合计与边界装配。
// 公开面（兼容类型、三个常量与六个导出函数）见 ./manual.js，本模块不含对外可见的常量。
import {
  CompactTrigger,
  modelMessageContentBlockToText,
  modelMessageContentToText,
} from "@knorvia/contracts";
import type { CompactBoundaryPayload, ModelMessageContent } from "@knorvia/contracts";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import type {
  BuildManualCompactBoundaryInput,
  CompactModelMessage,
  TokenUsageLike,
} from "./manual.js";
import { groupByAssistantStartedRounds } from "./rounds.js";

/** 系统提醒消息的前缀标记：以它开头的 user 消息不进摘要候选。 */
const SYSTEM_REMINDER_PREFIX = "<system-reminder>";

/** 边界 id 的可读前缀。 */
const BOUNDARY_ID_PREFIX = "compact_";

/** 无法序列化的工具入参按空对象计入长度。 */
const EMPTY_INPUT_JSON = "{}";

/** 压缩至少需要两轮对话。 */
const REQUIRED_ROUNDS = 2;

/**
 * 摘要候选：排除 system 角色与以系统提醒开头的 user 消息，其余返回浅拷贝。
 * 浅拷贝保证调用方拿到的列表改角色/内容时不会回写原数组里的对象。
 */
export function summarizableMessages(
  messages: readonly CompactModelMessage[],
): CompactModelMessage[] {
  const candidates: CompactModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user" && opensWithSystemReminder(message.content)) continue;
    candidates.push({ ...message });
  }
  return candidates;
}

function opensWithSystemReminder(content: ModelMessageContent): boolean {
  const text = modelMessageContentToText(content);
  return text.trimStart().startsWith(SYSTEM_REMINDER_PREFIX);
}

/** 轮数够且出现过助手消息，才认为可以压缩。 */
export function enoughRoundsToCompact(messages: readonly CompactModelMessage[]): boolean {
  const candidates = summarizableMessages(messages);
  const rounds = groupByAssistantStartedRounds(candidates, (message) => message.role);
  if (rounds.length < REQUIRED_ROUNDS) return false;
  return candidates.some((message) => message.role === "assistant");
}

/** 边界载荷：summarySource 固定为 model，未给的计数默认 0，自定义指令只记有无。 */
export function assembleCompactBoundary(
  input: BuildManualCompactBoundaryInput,
): CompactBoundaryPayload {
  const payload = {} as CompactBoundaryPayload;
  payload.boundaryId = input.boundaryId;
  payload.trigger = input.trigger ?? CompactTrigger.Manual;
  payload.phase = input.phase;
  payload.compactReason = input.compactReason;
  payload.summarySource = "model";
  payload.preCompactTokenCount = input.preCompactTokenCount;
  payload.postCompactTokenCount = input.postCompactTokenCount;
  payload.truePostCompactTokenCount = input.truePostCompactTokenCount;
  payload.autoCompactThreshold = input.autoCompactThreshold;
  payload.willRetriggerNextTurn = input.willRetriggerNextTurn;
  payload.summarizedMessageCount = input.summarizedMessageCount;
  payload.keptMessageCount = input.keptMessageCount ?? 0;
  payload.lastSummarizedMessageId = input.lastSummarizedMessageId;
  payload.preservedSegment = input.preservedSegment;
  payload.summaryMessageIds = [input.summaryMessageId];
  payload.customInstructions = input.customInstructions !== undefined;
  payload.traceId = input.traceContext.traceId;
  payload.turnId = input.traceContext.turnId;
  return payload;
}

/** token 估算：文本按字符分档，工具调用的名字与序列化入参一并计入。 */
export function estimateTokens(messages: readonly CompactModelMessage[]): number {
  let total = 0;
  for (const message of messages) {
    let characters = flatTextOf(message.content).length;
    for (const call of message.toolCalls ?? []) {
      characters += (call.name + serializedInputOf(call.input)).length;
    }
    total += Math.ceil(characters / ESTIMATED_TOKEN_CHAR_DIVISOR);
  }
  return total;
}

/** 内容块拍平成文本：reasoning 取 text，其余走通用转换，空块丢弃。 */
function flatTextOf(content: ModelMessageContent): string {
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const block of content) {
    const text = block.type === "reasoning" ? block.text : modelMessageContentBlockToText(block);
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

function serializedInputOf(input: unknown): string {
  try {
    return JSON.stringify(input ?? {}) ?? EMPTY_INPUT_JSON;
  } catch {
    // 循环引用等无法序列化的入参按空对象长度计入，保持旧的估算口径。
    return EMPTY_INPUT_JSON;
  }
}

/** 用量合计：优先 totalTokens，否则输入（含缓存读写）+ 输出。 */
export function usageTotalTokens(usage: TokenUsageLike | undefined): number {
  const cachedRead = usage?.cacheReadTokens ?? 0;
  const cachedWrite = usage?.cacheWriteTokens ?? 0;
  const fallbackInput = usage?.inputTokens ?? cachedRead + cachedWrite;
  return usage?.totalTokens ?? fallbackInput + (usage?.outputTokens ?? 0);
}

/** 边界 id：前缀 + 调用方给的 uuid 生成器。 */
export function boundaryIdFrom(randomUUID: () => string): string {
  return `${BOUNDARY_ID_PREFIX}${randomUUID()}`;
}
