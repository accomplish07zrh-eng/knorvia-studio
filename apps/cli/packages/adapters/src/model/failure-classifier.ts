// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  ModelErrorCode as ModelErrorCodeType,
  ModelFailureReason,
  ModelRetryReason,
} from "@knorvia/contracts";
import { ProviderBusinessError, isProviderBusinessError } from "./model-execution.js";
import {
  getProviderBusinessCodeMapping,
  isRetryableProviderBusinessNetworkFailure,
  isRetryableProviderBusinessTimeoutFailure,
} from "./failure-provider-business-codes.js";
import {
  getErrorCode,
  getResponseHeaders,
  getStatusCode,
  isAbortFailure,
  isContextExceededFailure,
  isNetworkFailure,
  isProviderMarkedRetryable,
  isProxyFailure,
  isTimeoutFailure,
  parseRetryAfterMs,
  unwrapRetryError,
} from "./failure-inspection.js";
import { isTlsFailure } from "./failure-tls.js";
import { isModelStreamIdleTimeoutError } from "./stream-idle-timeout.js";
import { readMappedAiSdkProviderBusinessError } from "./failure-ai-sdk-provider-error.js";

export interface ClassifiedModelFailure {
  code: ModelErrorCodeType;
  message: string;
  reason: ModelFailureReason;
  retryReason: ModelRetryReason;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
}
interface ProviderFailureDetails {
  providerErrorCode?: string;
  providerErrorMessage?: string;
  providerRequestId?: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Model request failed");
}
function providerCode(error: ProviderBusinessError): string | undefined {
  if (error.providerCode !== undefined) return String(error.providerCode);
  const summary = error.responseBodySummary;
  const nested =
    summary && typeof summary.error === "object" && summary.error !== null
      ? (summary.error as Record<string, unknown>)
      : undefined;
  for (const record of [summary, nested]) {
    if (!record) continue;
    for (const key of ["providerCode", "error_code", "code"]) {
      const value = record[key];
      if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))
        return String(value);
    }
  }
  const match = /^\[(\d{4})\](?=\[)/.exec(error.providerMessage ?? error.message);
  return match?.[1];
}
export function findProviderBusinessError(
  error: unknown,
  seen = new WeakSet<object>(),
): ProviderBusinessError | undefined {
  if (isProviderBusinessError(error)) return error;
  if (typeof error !== "object" || error === null || seen.has(error)) return undefined;
  seen.add(error);
  const record = error as Record<string, unknown>;
  return (
    findProviderBusinessError(record.cause, seen) ?? findProviderBusinessError(record.error, seen)
  );
}
export function inspectProviderFailure(error: unknown): ProviderFailureDetails {
  const business = findProviderBusinessError(error) ?? readMappedAiSdkProviderBusinessError(error);
  return business
    ? {
        providerErrorCode: providerCode(business),
        providerErrorMessage: business.providerMessage,
        providerRequestId: business.providerRequestId,
      }
    : {};
}
export function classifyModelFailure(
  error: unknown,
  abortSignal?: AbortSignal,
): ClassifiedModelFailure {
  const raw = unwrapRetryError(error);
  const statusCode = getStatusCode(raw);
  const retryAfterMs = parseRetryAfterMs(getResponseHeaders(raw));
  const code = getErrorCode(raw);
  const text = message(raw);
  const result = (
    value: Omit<ClassifiedModelFailure, "message" | "statusCode" | "retryAfterMs">,
  ): ClassifiedModelFailure => ({
    ...value,
    message: text,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
  if (isAbortFailure(raw, abortSignal))
    return result({
      code: "model_request_cancelled",
      reason: "cancelled",
      retryReason: "network_error",
      retryable: false,
    });
  if (isModelStreamIdleTimeoutError(raw))
    return result({
      code: "model_request_timeout",
      reason: "stream_idle_timeout",
      retryReason: "stream_idle_timeout",
      retryable: true,
    });
  const business = findProviderBusinessError(raw) ?? readMappedAiSdkProviderBusinessError(raw);
  if (business) {
    const value = providerCode(business);
    const mapping = value ? getProviderBusinessCodeMapping(value) : undefined;
    if (mapping)
      return {
        ...result(mapping),
        message: business.providerMessage ?? text,
        statusCode: business.statusCode ?? statusCode,
      };
    if (isRetryableProviderBusinessTimeoutFailure(business, value, statusCode))
      return result({
        code: "model_request_timeout",
        reason: "timeout",
        retryReason: "timeout",
        retryable: true,
      });
    if (isRetryableProviderBusinessNetworkFailure(business, value))
      return result({
        code: "model_request_failed",
        reason: "network_error",
        retryReason: "network_error",
        retryable: true,
      });
  }
  if (isTimeoutFailure(raw, code, statusCode))
    return result({
      code: "model_request_timeout",
      reason: "timeout",
      retryReason: "timeout",
      retryable: true,
    });
  if (statusCode === 429)
    return result({
      code: "model_rate_limited",
      reason: "rate_limited",
      retryReason: "rate_limited",
      retryable: true,
    });
  if (statusCode === 529)
    return result({
      code: "model_request_failed",
      reason: "provider_overloaded",
      retryReason: "provider_overloaded",
      retryable: true,
    });
  if (statusCode === 401 || statusCode === 403)
    return result({
      code: "provider_not_configured",
      reason: "auth_failed",
      retryReason: "auth_refresh",
      retryable: false,
    });
  if (isContextExceededFailure(raw))
    return result({
      code: "model_context_exceeded",
      reason: "context_exceeded",
      retryReason: "network_error",
      retryable: false,
    });
  if (statusCode === 400 || statusCode === 422)
    return result({
      code: "invalid_model_request",
      reason: "invalid_request",
      retryReason: "network_error",
      retryable: false,
    });
  if (statusCode !== undefined && statusCode >= 500)
    return result({
      code: "model_request_failed",
      reason: "server_error",
      retryReason: "server_error",
      retryable: true,
    });
  if (isTlsFailure(code))
    return result({
      code: "model_request_failed",
      reason: "tls_error",
      retryReason: "network_error",
      retryable: true,
    });
  if (isProxyFailure(code))
    return result({
      code: "model_request_failed",
      reason: "proxy_error",
      retryReason: "network_error",
      retryable: true,
    });
  if (isNetworkFailure(code))
    return result({
      code: "model_request_failed",
      reason: "network_error",
      retryReason: "network_error",
      retryable: true,
    });
  return result({
    code: "model_request_failed",
    reason: "unknown",
    retryReason: "network_error",
    retryable: isProviderMarkedRetryable(raw),
  });
}
export function isRetryableFailure(failure: ClassifiedModelFailure): boolean {
  return failure.retryable;
}
