// SPDX-License-Identifier: Apache-2.0
// off-peak 时段的失败特例：票据过期码（3102/3001，账号在 off-peak 窗口外）直接放弃；
// 排队码（3105）与 HTTP 429 按 Retry-After 重新排队，无头时用缺省等待、按上下限夹紧。
// 过期标记是对外可见文案的一部分，逐字保持。

import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { findProviderBusinessError } from "./failure-classifier.js";

export const OFF_PEAK_TICKET_EXPIRED_MARKER = "off-peak-ticket-expired";

const QUEUE_FALLBACK_MS = 60_000;
const QUEUE_CEILING_MS = 300_000;
const TICKET_EXPIRED_CODES = new Set(["3102", "3001"]);
const QUEUE_CODES = new Set(["3105"]);

type QueuedDecision = { kind: "queued"; delayMs: number };
type ExpiredDecision = { kind: "ticketExpired" };
type OffPeakDecision = QueuedDecision | ExpiredDecision;

function queuedDelay(retryAfterMs: number | undefined): number {
  const requested = retryAfterMs ?? QUEUE_FALLBACK_MS;
  return Math.min(QUEUE_CEILING_MS, Math.max(0, requested));
}

export function resolveOffPeakFailureDecision(input: {
  offPeak: boolean;
  failure: ClassifiedModelFailure;
  error: unknown;
}): OffPeakDecision | null {
  if (!input.offPeak) return null;
  const providerCode = findProviderBusinessError(input.error)?.providerCode;
  const normalizedCode = providerCode === undefined ? undefined : String(providerCode);
  if (normalizedCode !== undefined && TICKET_EXPIRED_CODES.has(normalizedCode))
    return { kind: "ticketExpired" } as const;
  const requeuedByCode = normalizedCode !== undefined && QUEUE_CODES.has(normalizedCode);
  if (!requeuedByCode && input.failure.statusCode !== 429) return null; // 非 off-peak 特例：交回常规失败裁决与预算判定。
  return { kind: "queued", delayMs: queuedDelay(input.failure.retryAfterMs) };
}

export function offPeakTicketExpiredMessage(original: string): string {
  const suffix = ` [${OFF_PEAK_TICKET_EXPIRED_MARKER}]`;
  return original.concat(suffix);
}
