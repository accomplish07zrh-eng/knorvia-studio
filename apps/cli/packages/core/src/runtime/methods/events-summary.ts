// SPDX-License-Identifier: Apache-2.0
// 追加汇总入口：累计/冲刷口径在 support/append-summary.ts，这里保持兼容导出面。
import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  admitAppendSummary as admitSummary,
  flushAppendSummaries as flushSummaries,
  type SummaryLogPort,
} from "./support/append-summary.js";

export function admitAppendSummary(
  runtime: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): boolean /* 入账结果（命中即跳过 appended debug） */ {
  const log = {
    debug: (message: string, fields: Record<string, unknown>) => {
      runtime.logger?.debug(message, fields);
    },
  } satisfies SummaryLogPort;
  return admitSummary(runtime, event, traceContext, log);
}

export function flushAppendSummaries(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
  flushReason: string,
): void /* 全量冲刷出口 */ {
  const log = {
    debug: (message: string, fields: Record<string, unknown>) => {
      runtime.logger?.debug(message, fields);
    },
  } satisfies SummaryLogPort;
  flushSummaries(runtime, traceContext, flushReason, log);
}
