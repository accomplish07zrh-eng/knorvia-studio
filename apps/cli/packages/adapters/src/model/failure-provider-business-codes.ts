// SPDX-License-Identifier: Apache-2.0
// provider 业务码 → 失败分类映射表：按码族分组登记（服务端/网络/过载/限流/配额/鉴权/无效请求/
// 上下文超限/未知），每组的 code/reason/retryReason/retryable 是判定语义，逐值锁定。
// 末尾两个判定：码表命中即不可重试（表优先于文案），否则按文案判网络/超时。

import type {
  ModelErrorCode as ModelErrorCodeType,
  ModelFailureReason,
  ModelRetryReason,
} from "@knorvia/contracts";
import type { ProviderBusinessError } from "./model-execution.js";

interface ProviderBusinessCodeMapping {
  code: ModelErrorCodeType; // 对外错误码（协议面）
  message?: string; // 覆盖消息（现表未启用）
  reason: ModelFailureReason; // 失败分类原因
  retryReason: ModelRetryReason; // 重试调度原因
  retryable: boolean; // 有界预算下是否允许重试
}

function mapOf(
  code: ModelErrorCodeType,
  reason: ModelFailureReason,
  retryReason: ModelRetryReason,
  retryable: boolean,
): ProviderBusinessCodeMapping {
  return { code, reason, retryReason, retryable };
}

const SERVER_RETRY = mapOf("model_request_failed", "server_error", "server_error", true);
const NETWORK_RETRY = mapOf("model_request_failed", "network_error", "network_error", true);
const OVERLOADED_RETRY = mapOf(
  "model_request_failed",
  "provider_overloaded",
  "provider_overloaded",
  true,
);
const RATE_LIMIT_RETRY = mapOf("model_rate_limited", "rate_limited", "rate_limited", true);
const RATE_LIMIT_FINAL = mapOf("model_rate_limited", "rate_limited", "rate_limited", false);
const AUTH_NOT_CONFIGURED = mapOf("provider_not_configured", "auth_failed", "auth_refresh", false);
const AUTH_INVALID = mapOf("invalid_model_request", "auth_failed", "auth_refresh", false);
const NOT_FOUND = mapOf("model_not_found", "invalid_request", "network_error", false);
const INVALID_REQUEST = mapOf("invalid_model_request", "invalid_request", "network_error", false);
const CONTEXT_EXCEEDED = mapOf(
  "model_context_exceeded",
  "context_exceeded",
  "network_error",
  false,
);
const REQUEST_FAILED = mapOf("model_request_failed", "invalid_request", "network_error", false);
const UNKNOWN_FINAL = mapOf("model_request_failed", "unknown", "network_error", false);

const CODE_GROUPS: ReadonlyArray<readonly [string, ProviderBusinessCodeMapping]> = [
  ["500 1120 1230 2007", SERVER_RETRY],
  ["1234", NETWORK_RETRY],
  ["1312 engine_overloaded_error overloaded_error", OVERLOADED_RETRY],
  ["1302 1303 1305 3002 rate_limit_reached_error rate_limit_error", RATE_LIMIT_RETRY],
  [
    "3008 3009 3010 1304 1308 1310 1313 insufficient_quota credit_balance_exhausted organization_spend_limit_exceeded project_spend_limit_exceeded organization_usage_limit_exceeded exceeded_current_quota_error 2056 20097 1316 1317 1318 1319 1320 1321",
    RATE_LIMIT_FINAL,
  ],
  ["1006", AUTH_NOT_CONFIGURED],
  ["3007", AUTH_INVALID],
  ["3006", NOT_FOUND],
  ["3001", INVALID_REQUEST],
  ["1261", CONTEXT_EXCEEDED],
  ["1005", REQUEST_FAILED],
  ["1113 1309 1311 1008 1314 1315", UNKNOWN_FINAL],
];

const registry = new Map<string, ProviderBusinessCodeMapping>();
for (const [codes, mapping] of CODE_GROUPS) {
  for (const code of codes.split(" ")) registry.set(code, mapping);
}

export function getProviderBusinessCodeMapping(
  providerCode: string,
): ProviderBusinessCodeMapping | undefined {
  return registry.get(providerCode);
}

const NETWORK_TEXT = /internal network|connection reset|socket hang up/iu;
const TIMEOUT_TEXT = /timed?\s*out/iu;

export function isRetryableProviderBusinessNetworkFailure(
  business: ProviderBusinessError,
  providerCode: string | undefined,
): boolean {
  if (providerCode && registry.has(providerCode)) return false;
  const text = `${business.providerMessage ?? ""} ${business.message}`;
  return NETWORK_TEXT.test(text);
}

export function isRetryableProviderBusinessTimeoutFailure(
  business: ProviderBusinessError,
  providerCode: string | undefined,
  statusCode?: number,
): boolean {
  if (providerCode && registry.has(providerCode)) return false;
  if (statusCode === 408 || statusCode === 504) return true;
  return TIMEOUT_TEXT.test(`${business.providerMessage ?? ""} ${business.message}`);
}
