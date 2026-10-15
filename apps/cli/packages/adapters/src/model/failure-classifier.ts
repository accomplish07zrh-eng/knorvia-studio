// SPDX-License-Identifier: Apache-2.0
// 失败分类：从任意错误（含业务错误与 AI SDK 兜底映射）裁出 ClassifiedModelFailure。
// 裁决顺序与各分支的 code/reason/retryReason/retryable 是协议面，逐字保持（B26 表锁定）。

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
  code: ModelErrorCodeType; // 对外错误码
  message: string; // 人类可读消息
  reason: ModelFailureReason; // 失败归因
  retryReason: ModelRetryReason; // 重试调度原因
  retryable: boolean; // 有界预算下可重试
  retryAfterMs?: number; // Retry-After 换算
  statusCode?: number; // HTTP 状态
}

interface ProviderFailureDetails {
  providerErrorCode?: string; // provider 业务码
  providerErrorMessage?: string; // provider 消息
  providerRequestId?: string; // provider 请求 id
}

type VerdictCore = Omit<ClassifiedModelFailure, "message" | "statusCode" | "retryAfterMs">;

function describe(origin: unknown): string {
  return origin instanceof Error ? origin.message : String(origin ?? "Model request failed");
}

const CODE_KEYS = ["providerCode", "error_code", "code"] as const;

function pickCode(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of CODE_KEYS) {
    const value = record[key];
    const usable =
      typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
    if (usable) return String(value);
  }
  return undefined;
}

function providerCodeOf(business: ProviderBusinessError): string | undefined {
  const direct = business.providerCode;
  if (direct !== undefined) return String(direct);
  const summary = business.responseBodySummary;
  const inner =
    summary && typeof summary.error === "object" && summary.error !== null
      ? (summary.error as Record<string, unknown>)
      : undefined;
  const tagged = /^\[(\d{4})\](?=\[)/.exec(business.providerMessage ?? business.message);
  return pickCode(summary) ?? pickCode(inner) ?? tagged?.[1];
}

export function findProviderBusinessError(
  origin: unknown,
  guard = new WeakSet<object>(),
): ProviderBusinessError | undefined {
  if (isProviderBusinessError(origin)) return origin;
  if (typeof origin !== "object" || origin === null || guard.has(origin)) return undefined;
  guard.add(origin);
  const record = origin as Record<string, unknown>;
  return (
    findProviderBusinessError(record.cause, guard) ?? findProviderBusinessError(record.error, guard)
  );
}

export function inspectProviderFailure(origin: unknown): ProviderFailureDetails {
  const business =
    findProviderBusinessError(origin) ?? readMappedAiSdkProviderBusinessError(origin);
  return business
    ? {
        providerErrorCode: providerCodeOf(business), // 业务码（多来源）
        providerErrorMessage: business.providerMessage, // provider 消息
        providerRequestId: business.providerRequestId, // provider 请求 id
      }
    : {};
}

const CANCELLED: VerdictCore = {
  code: "model_request_cancelled", // 取消（协议面）
  reason: "cancelled", // 归因
  retryReason: "network_error", // 调度原因
  retryable: false, // 不可重试
};
const IDLE_TIMEOUT: VerdictCore = {
  code: "model_request_timeout", // 超时（协议面）
  reason: "stream_idle_timeout", // 流空闲归因
  retryReason: "stream_idle_timeout", // 调度原因
  retryable: true, // 可重试
};
const PLAIN_TIMEOUT: VerdictCore = {
  code: "model_request_timeout", // 超时（协议面）
  reason: "timeout", // 归因
  retryReason: "timeout", // 调度原因
  retryable: true, // 可重试
};
const RATE_LIMITED: VerdictCore = {
  code: "model_rate_limited", // 限流（协议面）
  reason: "rate_limited", // 归因
  retryReason: "rate_limited", // 调度原因
  retryable: true, // 可重试
};
const OVERLOADED: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "provider_overloaded", // 过载归因
  retryReason: "provider_overloaded", // 调度原因
  retryable: true, // 可重试
};
const AUTH_FAILED: VerdictCore = {
  code: "provider_not_configured", // 未配置（协议面）
  reason: "auth_failed", // 鉴权归因
  retryReason: "auth_refresh", // 调度原因
  retryable: false, // 不可重试
};
const CONTEXT_EXCEEDED: VerdictCore = {
  code: "model_context_exceeded", // 上下文超限（协议面）
  reason: "context_exceeded", // 归因
  retryReason: "network_error", // 调度原因
  retryable: false, // 不可重试
};
const INVALID_REQUEST: VerdictCore = {
  code: "invalid_model_request", // 请求不合法（协议面）
  reason: "invalid_request", // 归因
  retryReason: "network_error", // 调度原因
  retryable: false, // 不可重试
};
const SERVER_ERROR: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "server_error", // 服务端归因
  retryReason: "server_error", // 调度原因
  retryable: true, // 可重试
};
const TLS_ERROR: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "tls_error", // TLS 归因
  retryReason: "network_error", // 调度原因
  retryable: true, // 可重试
};
const PROXY_ERROR: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "proxy_error", // 代理归因
  retryReason: "network_error", // 调度原因
  retryable: true, // 可重试
};
const NETWORK_ERROR: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "network_error", // 网络归因
  retryReason: "network_error", // 调度原因
  retryable: true, // 可重试
};
const UNKNOWN_OUTCOME: VerdictCore = {
  code: "model_request_failed", // 通用失败（协议面）
  reason: "unknown", // 未识别归因
  retryReason: "network_error", // 调度原因
  retryable: false, // 缺省不可重试（看 provider 标记）
};

interface LadderContext {
  unwrapped: unknown; // 去包装后的错误
  link?: AbortSignal; // 取消信号
  code?: string; // 错误码
  statusCode?: number; // HTTP 状态
  text: string; // 人类可读消息
  decorate: (value: VerdictCore) => ClassifiedModelFailure; // 补齐消息/状态/Retry-After
}

type Rule = (ctx: LadderContext) => ClassifiedModelFailure | null;

const businessRule: Rule = (ctx) => {
  const business =
    findProviderBusinessError(ctx.unwrapped) ?? readMappedAiSdkProviderBusinessError(ctx.unwrapped);
  if (!business) return null;
  const value = providerCodeOf(business);
  const mapping = value ? getProviderBusinessCodeMapping(value) : undefined;
  if (mapping) {
    return {
      ...ctx.decorate(mapping),
      message: business.providerMessage ?? ctx.text,
      statusCode: business.statusCode ?? ctx.statusCode,
    };
  }
  if (isRetryableProviderBusinessTimeoutFailure(business, value, ctx.statusCode)) {
    return ctx.decorate(PLAIN_TIMEOUT);
  }
  if (isRetryableProviderBusinessNetworkFailure(business, value)) {
    return ctx.decorate(NETWORK_ERROR);
  }
  return null;
};

const RULES: Rule[] = [
  (ctx) => (isAbortFailure(ctx.unwrapped, ctx.link) ? ctx.decorate(CANCELLED) : null),
  (ctx) => (isModelStreamIdleTimeoutError(ctx.unwrapped) ? ctx.decorate(IDLE_TIMEOUT) : null),
  businessRule,
  (ctx) =>
    isTimeoutFailure(ctx.unwrapped, ctx.code, ctx.statusCode) ? ctx.decorate(PLAIN_TIMEOUT) : null,
  (ctx) => (ctx.statusCode === 429 ? ctx.decorate(RATE_LIMITED) : null),
  (ctx) => (ctx.statusCode === 529 ? ctx.decorate(OVERLOADED) : null),
  (ctx) => (ctx.statusCode === 401 || ctx.statusCode === 403 ? ctx.decorate(AUTH_FAILED) : null),
  (ctx) => (isContextExceededFailure(ctx.unwrapped) ? ctx.decorate(CONTEXT_EXCEEDED) : null),
  (ctx) =>
    ctx.statusCode === 400 || ctx.statusCode === 422 ? ctx.decorate(INVALID_REQUEST) : null,
  (ctx) =>
    ctx.statusCode !== undefined && ctx.statusCode >= 500 ? ctx.decorate(SERVER_ERROR) : null,
  (ctx) => (isTlsFailure(ctx.code) ? ctx.decorate(TLS_ERROR) : null),
  (ctx) => (isProxyFailure(ctx.code) ? ctx.decorate(PROXY_ERROR) : null),
  (ctx) => (isNetworkFailure(ctx.code) ? ctx.decorate(NETWORK_ERROR) : null),
];

export function classifyModelFailure(origin: unknown, link?: AbortSignal): ClassifiedModelFailure {
  const unwrapped = unwrapRetryError(origin);
  const statusCode = getStatusCode(unwrapped);
  const retryAfterMs = parseRetryAfterMs(getResponseHeaders(unwrapped));
  const code = getErrorCode(unwrapped);
  const text = describe(unwrapped);
  const decorate = (value: VerdictCore): ClassifiedModelFailure => ({
    ...value,
    message: text, // 人类可读消息
    ...(statusCode === undefined ? {} : { statusCode }), // HTTP 状态
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }), // Retry-After 换算
  });
  const ctx: LadderContext = { unwrapped, link, code, statusCode, text, decorate };
  for (const rule of RULES) {
    const hit = rule(ctx);
    if (hit) return hit;
  }
  return decorate({
    ...UNKNOWN_OUTCOME,
    retryable: isProviderMarkedRetryable(unwrapped),
  });
}

export function isRetryableFailure(failure: ClassifiedModelFailure): boolean {
  return failure.retryable;
}
