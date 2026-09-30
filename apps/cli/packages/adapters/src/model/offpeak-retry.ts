// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { findProviderBusinessError } from "./failure-classifier.js";
export const OFF_PEAK_TICKET_EXPIRED_MARKER = "off-peak-ticket-expired";
type OffPeakFailureDecision = { kind: "queued"; delayMs: number } | { kind: "ticketExpired" };
const DEFAULT_DELAY_MS = 60_000;
const MAX_DELAY_MS = 300_000;
export function resolveOffPeakFailureDecision(params: {
  offPeak: boolean;
  failure: ClassifiedModelFailure;
  error: unknown;
}): OffPeakFailureDecision | null {
  if (!params.offPeak) return null;
  const business = findProviderBusinessError(params.error);
  const code = business?.providerCode === undefined ? undefined : String(business.providerCode);
  if (code === "3102" || code === "3001") return { kind: "ticketExpired" };
  if (code === "3105" || params.failure.statusCode === 429)
    return {
      kind: "queued",
      delayMs: Math.min(MAX_DELAY_MS, Math.max(0, params.failure.retryAfterMs ?? DEFAULT_DELAY_MS)),
    };
  return null;
}
export function offPeakTicketExpiredMessage(original: string): string {
  return `${original} [${OFF_PEAK_TICKET_EXPIRED_MARKER}]`;
}
