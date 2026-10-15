// SPDX-License-Identifier: Apache-2.0
// 用量投影入口：只读解释逻辑在 support/usage-projection.ts，这里保持兼容导出面（含类型）。
import type { SessionEvent } from "@knorvia/contracts";
import {
  firstModelTokenAt as firstTokenFromEvents,
  modelNetworkObservations as collectNetworkObservations,
  nonemptyString as readNonemptyString,
  usageCount as normalizeUsageCount,
  usageErrorInfo as explainUsageError,
  type ModelNetworkObservation,
  type UsageErrorInfo,
} from "./support/usage-projection.js";

/** 工具事件载荷的宽松读取面（全 unknown，防外部形状漂移）。 */
export interface ToolUsagePayload {
  toolCallId?: unknown;
  toolName?: unknown;
  decision?: unknown;
  startedAt?: unknown;
  outputBytes?: unknown;
  stdoutBytes?: unknown;
  stderrBytes?: unknown;
  duration?: unknown;
  result?: {
    perf?: { detail?: { kind?: string; command?: { exitCode?: unknown } } };
    returnedBytes?: unknown;
    originalBytes?: unknown;
    truncated?: unknown;
  };
  error?: { type?: unknown; code?: unknown; message?: unknown };
}

export function modelNetworkObservations(
  events: readonly SessionEvent[],
): ModelNetworkObservation[] /* 观测条目表 */ {
  return collectNetworkObservations({ events });
}

export function firstModelTokenAt(
  events: readonly SessionEvent[],
  startIndex: number,
): number | undefined /* 首 token 毫秒时刻 */ {
  return firstTokenFromEvents({ events, startIndex });
}

export function usageErrorInfo(
  error: unknown,
  failed: ModelNetworkObservation | undefined,
): UsageErrorInfo /* 错误四分支解释 */ {
  return explainUsageError({ error, failed });
}

export function nonemptyString(value: unknown): string | undefined /* 非空取值 */ {
  return readNonemptyString({ value });
}

export function usageCount(value: unknown): number /* 归一计数 */ {
  return normalizeUsageCount({ value });
}
