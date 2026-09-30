// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { isRecord } from "./runner-record.js";

function walk(error: unknown, visit: (record: Record<string, unknown>) => unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();
  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    const found = visit(current);
    if (found !== undefined) return found;
    current = current.cause;
  }
  return undefined;
}
export function unwrapRetryError(error: unknown): unknown {
  if (isRecord(error) && (error.name === "RetryError" || error.name === "AI_RetryError")) {
    const errors = error.errors;
    if (Array.isArray(errors) && errors.length) return errors[errors.length - 1];
    return error.lastError ?? error.cause ?? error;
  }
  return error;
}
export function getStatusCode(error: unknown): number | undefined {
  return walk(error, (record) => {
    for (const key of ["statusCode", "status", "responseStatus"]) {
      if (typeof record[key] === "number") return record[key];
    }
    return undefined;
  }) as number | undefined;
}
export function getHttpResponseStatus(error: unknown): number | undefined {
  return walk(error, (record) =>
    isRecord(record.response) && typeof record.response.status === "number"
      ? record.response.status
      : undefined,
  ) as number | undefined;
}
export function getApiCallResponseBody(error: unknown): unknown {
  return walk(
    error,
    (record) =>
      record.responseBody ?? (isRecord(record.response) ? record.response.body : undefined),
  );
}
export function getApiCallErrorData(error: unknown): unknown {
  return walk(error, (record) => record.data ?? record.errorData);
}
function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function getResponseHeaders(error: unknown): Record<string, string> | undefined {
  return walk(
    error,
    (record) =>
      normalizeHeaders(record.responseHeaders) ??
      (isRecord(record.response) ? normalizeHeaders(record.response.headers) : undefined),
  ) as Record<string, string> | undefined;
}
export function getErrorCode(error: unknown): string | undefined {
  return walk(error, (record) => (typeof record.code === "string" ? record.code : undefined)) as
    | string
    | undefined;
}
export function isAbortFailure(error: unknown, abortSignal?: AbortSignal): boolean {
  if (abortSignal?.aborted) return true;
  const record = isRecord(error) ? error : {};
  return (
    record.name === "AbortError" || record.code === "ABORT_ERR" || record.code === "ERR_ABORTED"
  );
}
export function isTimeoutFailure(
  error: unknown,
  code = getErrorCode(error),
  statusCode = getStatusCode(error),
): boolean {
  if (statusCode === 408 || statusCode === 504) return true;
  if (code && /TIMEOUT|TIMEDOUT|ETIMEDOUT/i.test(code)) return true;
  return error instanceof Error && /timed?\s*out/i.test(error.message);
}
export function isContextExceededFailure(error: unknown): boolean {
  const matches = (value: unknown) =>
    typeof value === "string" &&
    /context.{0,20}(length|window|limit|exceed)|too many tokens|maximum context/i.test(value);
  if (matches(error)) return true;
  return walk(error, (record) => (matches(record.message) ? true : undefined)) === true;
}
export function isProxyFailure(code?: string): boolean {
  return code ? /PROXY|ERR_PROXY/i.test(code) : false;
}
export function isNetworkFailure(code?: string): boolean {
  return code
    ? /^(ECONN|EPIPE|ENET|EHOST|EAI_|UND_ERR|CONNECTIONCLOSED|ERR_NETWORK)/i.test(code)
    : false;
}
export function isProviderMarkedRetryable(error: unknown): boolean {
  return (
    walk(error, (record) =>
      typeof record.isRetryable === "boolean"
        ? record.isRetryable
        : typeof record.retryable === "boolean"
          ? record.retryable
          : undefined,
    ) === true
  );
}
export function parseRetryAfterMs(headers?: Record<string, string>): number | undefined {
  if (!headers) return undefined;
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  if (/^(false|0)$/i.test(lower["x-should-retry"] ?? "")) return undefined;
  const millis = Number(lower["retry-after-ms"]);
  if (Number.isFinite(millis)) return Math.max(0, millis);
  const raw = lower["retry-after"];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const time = Date.parse(raw);
  return Number.isFinite(time) ? Math.max(0, time - Date.now()) : undefined;
}
