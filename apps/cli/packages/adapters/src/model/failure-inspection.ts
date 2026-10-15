// SPDX-License-Identifier: Apache-2.0
// 错误链检视：沿 cause 链（带环守卫）提取状态码、响应体、错误数据、header、错误码等字段，
// 并给出取消/超时/上下文超限/代理/网络/provider 可重试等判定。全部为纯函数，不抛错。

import { isRecord } from "./runner-record.js";

function traceChain(origin: unknown, visit: (record: Record<string, unknown>) => unknown): unknown {
  let cursor = origin;
  const visited = new Set<unknown>();
  while (isRecord(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    const found = visit(cursor);
    const hit = found !== undefined;
    if (hit) return found;
    cursor = cursor.cause;
  }
  return undefined;
}

export function unwrapRetryError(origin: unknown): unknown {
  if (!isRecord(origin)) return origin;
  const retryish = origin.name === "RetryError" || origin.name === "AI_RetryError";
  if (!retryish) return origin;
  const errors = origin.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.at(-1);
  return origin.lastError ?? origin.cause ?? origin;
}

const STATUS_KEYS = ["statusCode", "status", "responseStatus"] as const;

export function getStatusCode(origin: unknown): number | undefined {
  const picked = traceChain(origin, (record) => {
    for (const key of STATUS_KEYS) {
      const value = record[key];
      if (typeof value === "number") return value;
    }
    return undefined;
  });
  return picked as number | undefined;
}

export function getHttpResponseStatus(origin: unknown): number | undefined {
  const picked = traceChain(origin, (record) => {
    const response = record.response;
    if (!isRecord(response)) return undefined;
    return typeof response.status === "number" ? response.status : undefined;
  });
  return picked as number | undefined;
}

export function getApiCallResponseBody(origin: unknown): unknown {
  return traceChain(origin, (record) => {
    const direct = record.responseBody;
    if (direct !== undefined) return direct;
    return isRecord(record.response) ? record.response.body : undefined;
  });
}

export function getApiCallErrorData(origin: unknown): unknown {
  return traceChain(origin, (record) => record.data ?? record.errorData);
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (!isRecord(value)) return undefined;
  const projected: Record<string, string> = {};
  for (const name of Object.keys(value)) {
    const entry = value[name];
    if (typeof entry !== "string") continue;
    projected[name] = entry;
  }
  return Object.keys(projected).length ? projected : undefined;
}

export function getResponseHeaders(origin: unknown): Record<string, string> | undefined {
  const picked = traceChain(origin, (record) => {
    const direct = normalizeHeaders(record.responseHeaders);
    if (direct) return direct;
    return isRecord(record.response) ? normalizeHeaders(record.response.headers) : undefined;
  });
  return picked as Record<string, string> | undefined;
}

export function getErrorCode(origin: unknown): string | undefined {
  const picked = traceChain(origin, (record) =>
    typeof record.code === "string" ? record.code : undefined,
  );
  return picked as string | undefined;
}

const ABORT_CODES = new Set(["ABORT_ERR", "ERR_ABORTED"]);

export function isAbortFailure(origin: unknown, link?: AbortSignal): boolean {
  if (link?.aborted) return true;
  const record = isRecord(origin) ? origin : {};
  if (record.name === "AbortError") return true;
  return ABORT_CODES.has(String(record.code));
}

const TIMEOUT_CODE = /TIMEOUT|TIMEDOUT|ETIMEDOUT/iu;
const TIMEOUT_TEXT = /timed?\s*out/iu;

export function isTimeoutFailure(
  origin: unknown,
  code = getErrorCode(origin),
  statusCode = getStatusCode(origin),
): boolean {
  const byStatus = statusCode === 408 || statusCode === 504;
  if (byStatus) return true;
  if (code && TIMEOUT_CODE.test(code)) return true;
  return origin instanceof Error && TIMEOUT_TEXT.test(origin.message);
}

const CONTEXT_TEXT = /context.{0,20}(length|window|limit|exceed)|too many tokens|maximum context/iu;

export function isContextExceededFailure(origin: unknown): boolean {
  const matches = (value: unknown) => typeof value === "string" && CONTEXT_TEXT.test(value);
  if (matches(origin)) return true;
  return traceChain(origin, (record) => (matches(record.message) ? true : undefined)) === true;
}

export function isProxyFailure(token?: string): boolean {
  return token ? /PROXY|ERR_PROXY/iu.test(token) : false;
}

const NETWORK_PREFIX = /^(ECONN|EPIPE|ENET|EHOST|EAI_|UND_ERR|CONNECTIONCLOSED|ERR_NETWORK)/iu;

export function isNetworkFailure(token?: string): boolean {
  if (!token) return false;
  return NETWORK_PREFIX.test(token);
}

export function isProviderMarkedRetryable(origin: unknown): boolean {
  const flags = (record: Record<string, unknown>) => {
    const explicit = record.isRetryable;
    if (typeof explicit === "boolean") return explicit;
    const fallback = record.retryable;
    return typeof fallback === "boolean" ? fallback : undefined;
  };
  return traceChain(origin, flags) === true;
}

const RETRY_AFTER_MS = "retry-after-ms";
const RETRY_AFTER = "retry-after";
const NEVER_RETRY = /^(false|0)$/iu;

export function parseRetryAfterMs(bag?: Record<string, string>): number | undefined {
  if (!bag) return undefined;
  const lower: Record<string, string> = {};
  for (const name of Object.keys(bag)) lower[name.toLowerCase()] = bag[name];
  if (NEVER_RETRY.test(lower["x-should-retry"] ?? "")) return undefined;
  const millis = Number(lower[RETRY_AFTER_MS]);
  const millisUsable = Number.isFinite(millis);
  if (millisUsable) return Math.max(0, millis);
  const raw = lower[RETRY_AFTER];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const time = Date.parse(raw);
  return Number.isFinite(time) ? Math.max(0, time - Date.now()) : undefined;
}
