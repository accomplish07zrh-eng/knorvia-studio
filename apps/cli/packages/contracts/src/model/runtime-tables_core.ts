// SPDX-License-Identifier: Apache-2.0
// 模型面的取值表：会话类型、重试预算、错误码、传输种类、重试与失败原因。
// 组织方式：每张表只列一次**取值清单**，常量键由取值推导（`_` 分段、每段首字母大写）；
// 键不是机械推导的那张（传输种类）单独给出键表。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

/** 取值 → 键的推导：`invalid_model_selection` → `InvalidModelSelection`。 */
type ValueTableKey<Value extends string> = Value extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Head>}${ValueTableKey<Tail>}`
  : Capitalize<Value>;

function toValueTableKey(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

/** 由取值清单建常量表；顺序即常量表的键顺序。 */
function buildValueTable<const Values extends readonly string[]>(
  values: Values,
): { readonly [Value in Values[number] as ValueTableKey<Value>]: Value } {
  const entries = values.map((value) => [toValueTableKey(value), value] as const);
  return Object.fromEntries(entries) as unknown as {
    readonly [Value in Values[number] as ValueTableKey<Value>]: Value;
  };
}

/** 会话类型取值。 */
const MODEL_REQUEST_SESSION_TYPE_VALUES = ["main", "other", "subagent"] as const;

export const ModelRequestSessionType = buildValueTable(MODEL_REQUEST_SESSION_TYPE_VALUES);

export type ModelRequestSessionType = (typeof MODEL_REQUEST_SESSION_TYPE_VALUES)[number];

/** 重试预算档位取值。 */
const MODEL_RETRY_BUDGET_VALUES = ["default", "unbounded"] as const;

export const ModelRetryBudget = buildValueTable(MODEL_RETRY_BUDGET_VALUES);

export type ModelRetryBudget = (typeof MODEL_RETRY_BUDGET_VALUES)[number];

/** 模型错误码取值。 */
const MODEL_ERROR_CODE_VALUES = [
  "invalid_model_selection",
  "model_config_missing",
  "provider_not_found",
  "provider_not_configured",
  "model_not_found",
  "invalid_model_request",
  "invalid_model_response",
  "model_request_failed",
  "model_request_auth_missing",
  "model_request_cancelled",
  "model_request_timeout",
  "model_rate_limited",
  "model_context_exceeded",
] as const;

export const ModelErrorCode = buildValueTable(MODEL_ERROR_CODE_VALUES);

export type ModelErrorCode = (typeof MODEL_ERROR_CODE_VALUES)[number];

/** 传输种类取值。 */
const MODEL_TRANSPORT_KIND_VALUES = ["http", "sse", "websocket"] as const;

/** 传输种类的键表：`websocket` 的键不是机械推导出来的 `Websocket`，必须显式给出。 */
const MODEL_TRANSPORT_KIND_KEYS: Record<(typeof MODEL_TRANSPORT_KIND_VALUES)[number], string> = {
  http: "Http",
  sse: "Sse",
  websocket: "WebSocket",
};

export const ModelTransportKind = Object.fromEntries(
  MODEL_TRANSPORT_KIND_VALUES.map((value) => [MODEL_TRANSPORT_KIND_KEYS[value], value]),
) as unknown as { readonly Http: "http"; readonly Sse: "sse"; readonly WebSocket: "websocket" };

export type ModelTransportKind = (typeof MODEL_TRANSPORT_KIND_VALUES)[number];

/** 重试原因取值。 */
const MODEL_RETRY_REASON_VALUES = [
  "rate_limited",
  "provider_overloaded",
  "server_error",
  "network_error",
  "timeout",
  "stream_idle_timeout",
  "stale_connection",
  "auth_refresh",
  // Anthropic 明确拒绝历史 thinking signature 后，对请求副本清理并立即重试一次。
  "reasoning_signature_repair",
  // off-peak 闲时排队（429/3105+Retry-After）：豁免重试预算、无限探测（仅 idle plan provider）。
  "offpeak_queued",
] as const;

export const ModelRetryReason = buildValueTable(MODEL_RETRY_REASON_VALUES);

export type ModelRetryReason = (typeof MODEL_RETRY_REASON_VALUES)[number];

/** 失败原因里不属于重试原因的部分；失败原因是「重试原因 + 这一批」的并集。 */
const MODEL_FAILURE_EXTRA_VALUES = [
  "auth_failed",
  "cancelled",
  "context_exceeded",
  "invalid_request",
  "provider_not_configured",
  "proxy_error",
  "tls_error",
  "unknown",
] as const;

export const ModelFailureReason = {
  ...ModelRetryReason,
  ...buildValueTable(MODEL_FAILURE_EXTRA_VALUES),
} as const;

export type ModelFailureReason = ModelRetryReason | (typeof MODEL_FAILURE_EXTRA_VALUES)[number];
