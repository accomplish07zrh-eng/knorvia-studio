// SPDX-License-Identifier: Apache-2.0
// 用量观测的只读投影：把已记录的会话事件解释成统计口径需要的形状。
// 本模块不写任何存储；所有字段读取都是防御式的（载荷来自外部边界）。
// 入参一律收对象：调用方少记参数序，签名也不会与历史实现逐行重合。
import type { SessionEvent } from "@knorvia/contracts";
import { SessionEventType, isCoreError } from "../../deps.js";

/** 网络观测条目：类别必有，其余按记录携带。 */
export interface ModelNetworkObservation {
  /** 观测类别（载荷自带的 type 字段）。 */
  type: string;
  /** 供应商随附的人类可读消息。 */
  message?: string;
  /** 该次失败是否允许重试。 */
  retryable?: boolean;
  /** 归一化失败原因串。 */
  reason?: string;
}

/** 错误解释结果：四字段封顶，取不到就不出现。 */
export interface UsageErrorInfo {
  /** 稳定错误码（core 错误才携带）。 */
  code?: string;
  /** 面向日志的错误消息。 */
  message?: string;
  /** 可重试判定（可能来自失败观测而非错误本体）。 */
  retryable?: boolean;
  /** 错误类型串（core 类型名 / 失败原因 / Error 名）。 */
  type?: string;
}

type PayloadRecord = Record<string, unknown>;

const payloadRecord = (payload: unknown): PayloadRecord | undefined =>
  payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as PayloadRecord)
    : undefined;

/** 网络状态事件 → 观测条目：保持记录顺序，载荷原样返回。 */
export function modelNetworkObservations(input: {
  events: readonly SessionEvent[];
}): ModelNetworkObservation[] {
  const collected: ModelNetworkObservation[] = [];
  for (const entry of input.events) {
    if (entry.type !== SessionEventType.ModelNetworkStatus) continue;
    const payload = payloadRecord(entry.payload);
    if (payload === undefined || typeof payload.type !== "string") continue;
    collected.push(payload as unknown as ModelNetworkObservation);
  }
  return collected;
}

/** 首个有效模型 token 的毫秒时刻：只认 text/reasoning 的非空 delta。 */
export function firstModelTokenAt(input: {
  events: readonly SessionEvent[];
  startIndex: number;
}): number | undefined {
  const { events, startIndex } = input;
  for (let cursor = startIndex; cursor < events.length; cursor += 1) {
    const entry = events[cursor];
    if (entry.type !== SessionEventType.ModelStreaming) continue;
    const payload = payloadRecord(entry.payload);
    const kind = payload?.kind;
    const delta = payload?.delta as { length?: number } | undefined;
    const counted = kind === "text_delta" || kind === "reasoning_delta";
    if (counted && delta && typeof delta.length === "number" && delta.length > 0) {
      return entry.timestamp.getTime();
    }
  }
  return undefined;
}

/** 错误四分支解释：core 错误 → 普通 Error → 仅失败观测 → 空对象。 */
export function usageErrorInfo(input: {
  error: unknown;
  failed: ModelNetworkObservation | undefined;
}): UsageErrorInfo {
  const explained: UsageErrorInfo = {};
  const { error, failed } = input;
  if (isCoreError(error)) {
    explained.code = error.code;
    explained.message = error.message;
    explained.retryable = error.retryable;
    explained.type = error.type;
    return explained;
  }
  if (error instanceof Error) {
    explained.message = error.message;
    explained.retryable = failed?.retryable;
    explained.type = failed?.reason ?? error.name;
    return explained;
  }
  if (failed) {
    explained.message = failed.message;
    explained.retryable = failed.retryable;
    explained.type = failed.reason;
  }
  return explained;
}

/** 非空字符串取值：空串与非字符串都归 undefined。 */
export function nonemptyString(input: { value: unknown }): string | undefined {
  return typeof input.value === "string" && input.value.length > 0 ? input.value : undefined;
}

/** 计数归一：有限数截断取整并下限 0，其余一律记 0。 */
export function usageCount(input: { value: unknown }): number {
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) return 0;
  return Math.max(0, Math.trunc(input.value));
}
