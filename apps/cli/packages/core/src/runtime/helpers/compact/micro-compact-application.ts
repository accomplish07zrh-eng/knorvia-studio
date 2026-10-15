// SPDX-License-Identifier: Apache-2.0
// 本地微压缩的应用（B25 的微压缩半边）。
// 先把条目投影成提供方请求消息，交给微压缩策略拿到「被清理的工具调用 id + 清理后内容」，
// 再按条目下标**原位替换**对应的工具结果内容（copy-on-write：只动被清理的条目，其余保持
// 原引用，避免为保护 MessageHistory 的只读借用而深拷贝整段历史）。
// 无清理 payload 时原样返回输入条目（不拷贝）；不抛异常、不修改入参。
import {
  cloneModelMessageContent,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { maybeLocalMicrocompactMessages } from "../../deps.js";
import type { LocalMicrocompactPolicyConfig } from "../../deps.js";
import { buildProviderRequestMessages } from "../provider-request-messages.js";

export interface MicrocompactApplicationInput {
  config?: /* 微压缩策略配置 */ LocalMicrocompactPolicyConfig;
  entries: /* 待投影的历史条目 */ readonly RuntimeMessageEntry[];
  lastAssistantCompletedAtMs?: /* 上次助手完成时刻（策略输入） */ number;
  nowMs?: /* 当前时刻（策略输入） */ number;
  useMidConversationSystem?: /* 投影开关：中途系统提醒归位 */ boolean;
}

export interface MicrocompactApplicationResult {
  decision: /* 策略决策，总是有值 */ ReturnType<typeof maybeLocalMicrocompactMessages>["decision"];
  entries: /* 原数组或 copy-on-write 后的新数组 */ readonly RuntimeMessageEntry[];
  payload?: /* 清理明细；无清理时缺席 */ ReturnType<
    typeof maybeLocalMicrocompactMessages
  >["payload"];
}

export const maybeLocalMicrocompactRuntimeEntries = (
  request: MicrocompactApplicationInput,
): MicrocompactApplicationResult => {
  // 投影阶段：条目 → 提供方请求消息（纯计算，不开缓存控制）。
  const projection = buildProviderRequestMessages({
    entries: request.entries,
    applyCacheControl: false, // 微压缩不需要缓存锚点
    useMidConversationSystem: request.useMidConversationSystem,
  });
  const projected = projection.messages;
  const outcome = maybeLocalMicrocompactMessages({
    config: request.config,
    lastAssistantCompletedAtMs: request.lastAssistantCompletedAtMs,
    messages: projected,
    nowMs: request.nowMs,
  });

  if (!outcome.payload) {
    return { decision: outcome.decision, entries: request.entries };
  }

  // 被清理的工具结果内容按 toolCallId 归档（内容走克隆，替换时不引用投影侧对象）。
  const clearedIds = new Set<string>(outcome.payload.clearedToolCallIds);
  const clearedPairs = outcome.messages
    .filter((item) => item.role === "tool" && item.toolCallId && clearedIds.has(item.toolCallId))
    .map((item) => [item.toolCallId!, cloneModelMessageContent(item.content)] as const);
  const clearedContentByToolCallId = new Map(clearedPairs);

  // copy-on-write：只有命中清理表的工具结果换内容，别的条目原引用不动。
  const applied = request.entries.map((entry) => {
    if (isRuntimeAttachmentEntry(entry)) return entry;
    if (entry.message.role !== "tool" || !entry.message.toolCallId) return entry;
    const replacement = clearedContentByToolCallId.get(entry.message.toolCallId);
    if (!replacement) return entry;
    const rewritten = {
      ...entry,
      message: { ...entry.message, content: replacement },
    };
    return rewritten;
  });

  return { decision: outcome.decision, entries: applied, payload: outcome.payload };
};
