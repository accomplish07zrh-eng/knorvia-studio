// SPDX-License-Identifier: Apache-2.0
// 压缩触发 → 阶段/原因映射与失败原因归一（B24）。
// 阶段：自动 → 请求前，反应式 → 反应式，手动/部分/会话记忆 → 独立回合。
// 原因：自动与会话记忆 → 上下文超限，反应式 → 提供方溢出，手动与部分 → 用户请求。
// 失败原因：核心错误取其类型，普通错误取非空消息，否则 `unknown`。
// 全部同步纯计算、不抛异常（枚举完备由类型保证）。
import { CompactPhase, CompactReason, CompactTrigger, isCoreError } from "../../deps.js";

// 触发 → 阶段的冻结映射（协议面）。
const PHASE_FOR_TRIGGER = {
  [CompactTrigger.Auto]: CompactPhase.PreRequest,
  [CompactTrigger.Reactive]: CompactPhase.Reactive,
  [CompactTrigger.Manual]: CompactPhase.StandaloneTurn,
  [CompactTrigger.Partial]: CompactPhase.StandaloneTurn,
  [CompactTrigger.SessionMemory]: CompactPhase.StandaloneTurn,
} satisfies Record<CompactTrigger, CompactPhase>;

// 触发 → 原因的冻结映射（协议面）：会话记忆归上下文超限。
const REASON_FOR_TRIGGER = {
  [CompactTrigger.Auto]: CompactReason.ContextLimit,
  [CompactTrigger.SessionMemory]: CompactReason.ContextLimit,
  [CompactTrigger.Reactive]: CompactReason.ProviderOverflow,
  [CompactTrigger.Manual]: CompactReason.UserRequested,
  [CompactTrigger.Partial]: CompactReason.UserRequested,
} satisfies Record<CompactTrigger, CompactReason>;

// 失败原因的兜底串（逐字冻结）。
const UNKNOWN_FAILURE_REASON = "unknown";

export const defaultCompactPhaseForTrigger = (trigger: CompactTrigger): CompactPhase =>
  PHASE_FOR_TRIGGER[trigger];

export const defaultCompactReasonForTrigger = (trigger: CompactTrigger): CompactReason =>
  REASON_FOR_TRIGGER[trigger];

export const compactFailureReasonFromError = (error: unknown): string => {
  if (isCoreError(error)) return error.type;
  const message = error instanceof Error ? error.message : "";
  return message.length > 0 ? message : UNKNOWN_FAILURE_REASON;
};
