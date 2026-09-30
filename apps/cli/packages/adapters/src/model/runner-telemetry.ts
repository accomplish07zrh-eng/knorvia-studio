// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelApiErrorPhase, ModelFailureExceptionKind } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { getErrorCode } from "./failure-inspection.js";
import { inspectProviderFailure } from "./failure-classifier.js";
import { findProviderBusinessError } from "./failure-classifier.js";
import { readMappedAiSdkProviderBusinessError } from "./failure-ai-sdk-provider-error.js";
export function readModelFailureErrorPhase(error: unknown): ModelApiErrorPhase | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value =
    (error as { context?: { errorPhase?: unknown }; errorPhase?: unknown }).context?.errorPhase ??
    (error as { errorPhase?: unknown }).errorPhase;
  return typeof value === "string" ? (value as ModelApiErrorPhase) : undefined;
}
export function modelFailureAttributionFields(
  error: unknown,
  failure: ClassifiedModelFailure,
  errorPhase: unknown,
): { errorPhase?: ModelApiErrorPhase; exceptionKind: ModelFailureExceptionKind } {
  const phase =
    typeof errorPhase === "string"
      ? (errorPhase as ModelApiErrorPhase)
      : readModelFailureErrorPhase(error);
  const business = findProviderBusinessError(error) ?? readMappedAiSdkProviderBusinessError(error);
  const kind: ModelFailureExceptionKind = business
    ? "provider_business"
    : failure.reason === "invalid_request"
      ? "protocol"
      : failure.reason === "network_error" ||
          failure.reason === "proxy_error" ||
          failure.reason === "tls_error" ||
          failure.reason === "timeout" ||
          failure.reason === "stream_idle_timeout" ||
          failure.reason === "cancelled"
        ? "transport"
        : "api_call";
  return { errorPhase: phase, exceptionKind: kind };
}
export function modelFailureStatusFields(
  error: unknown,
  failure: ClassifiedModelFailure,
  errorPhase: ModelApiErrorPhase,
) {
  const details = inspectProviderFailure(error);
  return {
    errorCode: failure.code,
    errorPhase,
    exceptionType: error instanceof Error ? error.name : getErrorCode(error),
    ...details,
    retryAfterMs: failure.retryAfterMs,
  };
}
export function providerRequestIdFromHeaders(headers: Record<string, string>): string | undefined {
  for (const [name, value] of Object.entries(headers))
    if (/^(x-request-id|request-id|x-amzn-requestid|cf-ray)$/i.test(name)) return value;
  return undefined;
}
