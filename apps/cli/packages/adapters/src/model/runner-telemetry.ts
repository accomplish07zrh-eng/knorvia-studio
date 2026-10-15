// SPDX-License-Identifier: Apache-2.0
// 失败遥测归因：把失败分类折成事件携带的 errorPhase/exceptionKind/exceptionType 三件套，
// provider 细节复用业务错误检视；provider 请求 id 只认既有网关头集合。

import type { ModelApiErrorPhase, ModelFailureExceptionKind } from "@knorvia/contracts";
import type { ClassifiedModelFailure } from "./failure-classifier.js";
import { getErrorCode } from "./failure-inspection.js";
import { inspectProviderFailure } from "./failure-classifier.js";
import { findProviderBusinessError } from "./failure-classifier.js";
import { readMappedAiSdkProviderBusinessError } from "./failure-ai-sdk-provider-error.js";

const REQUEST_ID_HEADER = /^(x-request-id|request-id|x-amzn-requestid|cf-ray)$/iu;
const TRANSPORT_REASONS = new Set([
  "network_error",
  "proxy_error",
  "tls_error",
  "timeout",
  "stream_idle_timeout",
  "cancelled",
]);

function phaseOf(candidate: unknown): ModelApiErrorPhase | undefined {
  if (typeof candidate !== "object" || candidate === null) return undefined;
  const bag = candidate as { context?: { errorPhase?: unknown }; errorPhase?: unknown };
  const picked = bag.context?.errorPhase ?? bag.errorPhase;
  return typeof picked === "string" ? (picked as ModelApiErrorPhase) : undefined;
}

export function readModelFailureErrorPhase(candidate: unknown): ModelApiErrorPhase | undefined {
  return phaseOf(candidate);
}

function kindOf(candidate: unknown, verdict: ClassifiedModelFailure): ModelFailureExceptionKind {
  const business =
    findProviderBusinessError(candidate) ?? readMappedAiSdkProviderBusinessError(candidate);
  if (business) return "provider_business";
  if (verdict.reason === "invalid_request") return "protocol";
  return TRANSPORT_REASONS.has(verdict.reason) ? "transport" : "api_call";
}

export function modelFailureAttributionFields(
  candidate: unknown,
  verdict: ClassifiedModelFailure,
  claimedPhase: unknown,
): { errorPhase?: ModelApiErrorPhase; exceptionKind: ModelFailureExceptionKind } {
  const resolvedPhase =
    typeof claimedPhase === "string" ? (claimedPhase as ModelApiErrorPhase) : phaseOf(candidate);
  return { errorPhase: resolvedPhase, exceptionKind: kindOf(candidate, verdict) };
}

export function modelFailureStatusFields(
  candidate: unknown,
  verdict: ClassifiedModelFailure,
  resolvedPhase: ModelApiErrorPhase,
) {
  const providerDetails = inspectProviderFailure(candidate);
  const fields = {
    errorCode: verdict.code,
    errorPhase: resolvedPhase,
    exceptionType: candidate instanceof Error ? candidate.name : getErrorCode(candidate),
    ...providerDetails,
    retryAfterMs: verdict.retryAfterMs,
  };
  return fields;
}

export function providerRequestIdFromHeaders(bag: Record<string, string>): string | undefined {
  let found: string | undefined;
  for (const name of Object.keys(bag)) {
    if (found === undefined && REQUEST_ID_HEADER.test(name)) found = bag[name];
  }
  return found;
}
