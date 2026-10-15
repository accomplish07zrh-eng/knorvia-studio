// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B19–B26（错误体系、失败分类与业务码表）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./entry.mjs";

const { AiSdkModelAdapterError, ModelErrorSource, createLocalProviderConfigurationErrorContext } =
  await load("model/errors");
const {
  getApiCallErrorData,
  getApiCallResponseBody,
  getErrorCode,
  getHttpResponseStatus,
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
} = await load("model/failure-inspection");
const {
  getProviderBusinessCodeMapping,
  isRetryableProviderBusinessNetworkFailure,
  isRetryableProviderBusinessTimeoutFailure,
} = await load("model/failure-provider-business-codes");
const {
  classifyModelFailure,
  findProviderBusinessError,
  inspectProviderFailure,
  isRetryableFailure,
} = await load("model/failure-classifier");
const { ProviderBusinessError, readProviderBusinessFailureFromBody } =
  await load("model/model-execution");
const { readMappedAiSdkProviderBusinessError } = await load("model/failure-ai-sdk-provider-error");

test("B19 错误对象体系与本地 provider 配置错误上下文", () => {
  const error = new AiSdkModelAdapterError("model_request_failed", "boom", {
    cause: new Error("root"),
    context: { a: 1 },
  });
  assert.equal(error.name, "AiSdkModelAdapterError");
  assert.equal(error.code, "model_request_failed");
  assert.equal(error.message, "boom");
  assert.equal((error.cause as Error).message, "root");
  error.enrichContext({ a: 2, b: 3 });
  assert.deepEqual(error.context, { a: 1, b: 3 });
  const bare = new AiSdkModelAdapterError("model_request_failed", "bare");
  assert.equal(bare.cause, undefined);
  bare.enrichContext({ first: true });
  assert.deepEqual(bare.context, { first: true });
  assert.deepEqual(ModelErrorSource, {
    Network: "network",
    Provider: "provider",
    Runtime: "runtime",
  });
  assert.deepEqual(
    createLocalProviderConfigurationErrorContext({ providerId: "prov", modelId: "m" as never }),
    {
      providerId: "prov",
      modelId: "m",
      reason: "provider_not_configured",
      retryable: false,
      source: "runtime",
    },
  );
});

test("B20 错误链检视工具（cause 链遍历与字段提取）", () => {
  const headers = new Headers({ "x-h": "v" });
  const deep = {
    code: "ECONNRESET",
    statusCode: 502,
    responseHeaders: { "retry-after": "3" },
    responseBody: { ok: false },
    data: { raw: true },
    isRetryable: true,
    cause: {
      status: 503,
      response: { status: 504, headers, body: { via: "response" } },
      errorData: { deep: true },
    },
  };
  assert.equal(getStatusCode(deep), 502);
  assert.equal(getErrorCode(deep), "ECONNRESET");
  assert.equal(getHttpResponseStatus(deep), 504);
  assert.deepEqual(getApiCallResponseBody(deep), { ok: false });
  assert.deepEqual(getApiCallErrorData(deep), { raw: true });
  assert.deepEqual(getResponseHeaders(deep), { "retry-after": "3" });
  assert.equal(isProviderMarkedRetryable(deep), true);
  const cyclic: Record<string, unknown> = { code: "X" };
  cyclic.cause = cyclic;
  assert.equal(getStatusCode(cyclic), undefined);
  const retryWrapped = {
    name: "RetryError",
    errors: [{ code: "first" }, { code: "last" }],
  };
  assert.deepEqual(unwrapRetryError(retryWrapped), { code: "last" });
  const lastErrorWrapped = { name: "AI_RetryError", lastError: { code: "via-last" } };
  assert.deepEqual(unwrapRetryError(lastErrorWrapped), { code: "via-last" });
  assert.deepEqual(unwrapRetryError({ code: "plain" }), { code: "plain" });
  const signal = new AbortController();
  signal.abort("reason-x");
  assert.equal(isAbortFailure({}, signal.signal), true);
  assert.equal(isAbortFailure({ name: "AbortError" }), true);
  assert.equal(isAbortFailure({ code: "ABORT_ERR" }), true);
  assert.equal(isAbortFailure({ code: "ERR_ABORTED" }), true);
  assert.equal(isAbortFailure({}), false);
  assert.equal(isTimeoutFailure({ statusCode: 408 }), true);
  assert.equal(isTimeoutFailure({ statusCode: 504 }), true);
  assert.equal(isTimeoutFailure({ code: "ETIMEDOUT" }), true);
  assert.equal(isTimeoutFailure(new Error("request timed out")), true);
  assert.equal(isTimeoutFailure(new Error("fine")), false);
  assert.equal(isContextExceededFailure(new Error("context length exceeded")), true);
  assert.equal(isContextExceededFailure(new Error("too many tokens")), true);
  assert.equal(isContextExceededFailure({ cause: new Error("maximum context reached") }), true);
  assert.equal(isContextExceededFailure(new Error("other")), false);
  assert.equal(isProxyFailure("ERR_PROXY"), true);
  assert.equal(isProxyFailure("ECONNRESET"), false);
  assert.equal(isNetworkFailure("ECONNRESET"), true);
  assert.equal(isNetworkFailure("UND_ERR_SOCKET"), true);
  assert.equal(isNetworkFailure("EPROTO"), false);
});

test("B21 Retry-After 响应头解析（语义常量）", () => {
  assert.equal(parseRetryAfterMs(undefined), undefined);
  assert.equal(parseRetryAfterMs({ "x-should-retry": "false" }), undefined);
  assert.equal(parseRetryAfterMs({ "X-Should-Retry": "0" }), undefined);
  assert.equal(parseRetryAfterMs({ "retry-after-ms": "1500" }), 1500);
  assert.equal(parseRetryAfterMs({ "retry-after-ms": "-5" }), 0);
  assert.equal(parseRetryAfterMs({ "retry-after": "3" }), 3000);
  assert.equal(parseRetryAfterMs({ "retry-after": "-2" }), 0);
  const inOneHour = new Date(Date.now() + 3_600_000).toUTCString();
  const parsed = parseRetryAfterMs({ "retry-after": inOneHour });
  assert.ok(parsed !== undefined && parsed > 3_500_000 && parsed <= 3_600_000);
  assert.equal(parseRetryAfterMs({ "retry-after": "garbage" }), undefined);
});

test("B22 provider 业务码映射表（逐码锁定）", () => {
  const groups: Array<[string[], Record<string, unknown>]> = [
    [
      ["500", "1120", "1230", "2007"],
      {
        code: "model_request_failed",
        reason: "server_error",
        retryReason: "server_error",
        retryable: true,
      },
    ],
    [
      ["1234"],
      {
        code: "model_request_failed",
        reason: "network_error",
        retryReason: "network_error",
        retryable: true,
      },
    ],
    [
      ["1312", "engine_overloaded_error", "overloaded_error"],
      {
        code: "model_request_failed",
        reason: "provider_overloaded",
        retryReason: "provider_overloaded",
        retryable: true,
      },
    ],
    [
      ["1302", "1303", "1305", "3002", "rate_limit_reached_error", "rate_limit_error"],
      {
        code: "model_rate_limited",
        reason: "rate_limited",
        retryReason: "rate_limited",
        retryable: true,
      },
    ],
    [
      [
        "3008",
        "3009",
        "3010",
        "1304",
        "1308",
        "1310",
        "1313",
        "insufficient_quota",
        "credit_balance_exhausted",
        "organization_spend_limit_exceeded",
        "project_spend_limit_exceeded",
        "organization_usage_limit_exceeded",
        "exceeded_current_quota_error",
        "2056",
        "20097",
        "1316",
        "1317",
        "1318",
        "1319",
        "1320",
        "1321",
      ],
      {
        code: "model_rate_limited",
        reason: "rate_limited",
        retryReason: "rate_limited",
        retryable: false,
      },
    ],
    [
      ["1006"],
      {
        code: "provider_not_configured",
        reason: "auth_failed",
        retryReason: "auth_refresh",
        retryable: false,
      },
    ],
    [
      ["3007"],
      {
        code: "invalid_model_request",
        reason: "auth_failed",
        retryReason: "auth_refresh",
        retryable: false,
      },
    ],
    [
      ["3006"],
      {
        code: "model_not_found",
        reason: "invalid_request",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      ["3001"],
      {
        code: "invalid_model_request",
        reason: "invalid_request",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      ["1261"],
      {
        code: "model_context_exceeded",
        reason: "context_exceeded",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      ["1005"],
      {
        code: "model_request_failed",
        reason: "invalid_request",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      ["1113", "1309", "1311", "1008", "1314", "1315"],
      {
        code: "model_request_failed",
        reason: "unknown",
        retryReason: "network_error",
        retryable: false,
      },
    ],
  ];
  for (const [codes, mapping] of groups) {
    for (const code of codes) {
      assert.deepEqual(getProviderBusinessCodeMapping(code), mapping, code);
    }
  }
  assert.equal(getProviderBusinessCodeMapping("unmapped-code"), undefined);
});

test("B23 业务错误的网络/超时可重试判定", () => {
  const business = (message: string) =>
    new ProviderBusinessError({
      providerId: "p",
      providerKind: "openai-compatible",
      providerMessage: message,
    });
  assert.equal(
    isRetryableProviderBusinessNetworkFailure(business("internal network failure"), undefined),
    true,
  );
  assert.equal(
    isRetryableProviderBusinessNetworkFailure(business("connection reset by peer"), undefined),
    true,
  );
  assert.equal(
    isRetryableProviderBusinessNetworkFailure(business("socket hang up"), undefined),
    true,
  );
  assert.equal(
    isRetryableProviderBusinessNetworkFailure(business("quota exceeded"), undefined),
    false,
  );
  assert.equal(
    isRetryableProviderBusinessNetworkFailure(business("internal network failure"), "1302"),
    false,
  );
  assert.equal(isRetryableProviderBusinessTimeoutFailure(business("x"), undefined, 408), true);
  assert.equal(isRetryableProviderBusinessTimeoutFailure(business("x"), undefined, 504), true);
  assert.equal(
    isRetryableProviderBusinessTimeoutFailure(business("time out"), undefined, undefined),
    true,
  );
  assert.equal(
    isRetryableProviderBusinessTimeoutFailure(business("request timeout"), undefined, undefined),
    true,
  );
  assert.equal(
    isRetryableProviderBusinessTimeoutFailure(business("timed-out"), undefined, undefined),
    false,
  );
  assert.equal(isRetryableProviderBusinessTimeoutFailure(business("quota"), "1005", 408), false);
});

test("B24 AI SDK 错误到业务错误的兜底映射", () => {
  assert.equal(readMappedAiSdkProviderBusinessError({}), undefined);
  const mapped = readMappedAiSdkProviderBusinessError({
    data: { error: { code: "1234", message: "boom" } },
    responseHeaders: { "x-h": "1" },
    statusCode: 400,
  });
  assert.ok(mapped instanceof ProviderBusinessError);
  assert.equal(mapped.providerId, "unknown");
  assert.equal(mapped.providerKind, "openai-compatible");
  assert.equal(mapped.providerCode, "1234");
  assert.equal(mapped.statusCode, 400);
  const viaBody = readMappedAiSdkProviderBusinessError({
    response: { body: { message: "only message", status: 502 }, status: 500 },
  });
  assert.equal(viaBody?.providerMessage, "only message");
  assert.equal(viaBody?.statusCode, 502);
});

test("B25 业务错误定位与 provider 细节提取", () => {
  const business = new ProviderBusinessError({
    providerId: "p",
    providerKind: "openai-compatible",
    providerCode: 4321,
    providerMessage: "[4321][extra] bad thing",
    providerRequestId: "rid-1",
  });
  const wrapped = { cause: { error: business } };
  assert.equal(findProviderBusinessError(wrapped), business);
  assert.equal(findProviderBusinessError({}), undefined);
  const details = inspectProviderFailure(wrapped);
  assert.equal(details.providerErrorCode, "4321");
  assert.equal(details.providerErrorMessage, "[4321][extra] bad thing");
  assert.equal(details.providerRequestId, "rid-1");
  const duck = {
    isProviderBusinessError: true,
    providerMessage: "[9999][x] duck",
    message: "[9999][x] duck",
  };
  assert.equal(findProviderBusinessError(duck), duck);
  assert.equal(inspectProviderFailure(duck).providerErrorCode, "9999");
  assert.deepEqual(inspectProviderFailure({}), {});
  const bodyFallback = inspectProviderFailure({
    isProviderBusinessError: true,
    message: "plain",
    responseBodySummary: { error: { error_code: "77" } },
  });
  assert.equal(bodyFallback.providerErrorCode, "77");
  void readProviderBusinessFailureFromBody;
});

test("B26 失败分类裁决表（classifyModelFailure）", () => {
  const classify = (error: unknown, signal?: AbortSignal) => classifyModelFailure(error, signal);
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(pick(classify({}, aborted.signal)), {
    code: "model_request_cancelled",
    reason: "cancelled",
    retryReason: "network_error",
    retryable: false,
  });
  assert.deepEqual(pick(classify({ code: "MODEL_STREAM_IDLE_TIMEOUT" })), {
    code: "model_request_timeout",
    reason: "stream_idle_timeout",
    retryReason: "stream_idle_timeout",
    retryable: true,
  });
  const businessMapped = classify({
    isProviderBusinessError: true,
    providerCode: "1302",
    providerMessage: "rate",
    statusCode: 429,
    message: "rate",
  });
  assert.deepEqual(pick(businessMapped), {
    code: "model_rate_limited",
    reason: "rate_limited",
    retryReason: "rate_limited",
    retryable: true,
  });
  assert.equal(businessMapped.message, "rate");
  assert.equal(businessMapped.statusCode, 429);
  assert.deepEqual(
    pick(classify({ isProviderBusinessError: true, providerMessage: "timed out" })),
    {
      code: "model_request_timeout",
      reason: "timeout",
      retryReason: "timeout",
      retryable: true,
    },
  );
  assert.deepEqual(
    pick(classify({ isProviderBusinessError: true, providerMessage: "connection reset" })),
    {
      code: "model_request_failed",
      reason: "network_error",
      retryReason: "network_error",
      retryable: true,
    },
  );
  const rows: Array<[unknown, Record<string, unknown>]> = [
    [
      { statusCode: 504 },
      { code: "model_request_timeout", reason: "timeout", retryReason: "timeout", retryable: true },
    ],
    [
      { statusCode: 429 },
      {
        code: "model_rate_limited",
        reason: "rate_limited",
        retryReason: "rate_limited",
        retryable: true,
      },
    ],
    [
      { statusCode: 529 },
      {
        code: "model_request_failed",
        reason: "provider_overloaded",
        retryReason: "provider_overloaded",
        retryable: true,
      },
    ],
    [
      { statusCode: 401 },
      {
        code: "provider_not_configured",
        reason: "auth_failed",
        retryReason: "auth_refresh",
        retryable: false,
      },
    ],
    [
      { statusCode: 403 },
      {
        code: "provider_not_configured",
        reason: "auth_failed",
        retryReason: "auth_refresh",
        retryable: false,
      },
    ],
    [
      new Error("context window exceeded"),
      {
        code: "model_context_exceeded",
        reason: "context_exceeded",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      { statusCode: 400 },
      {
        code: "invalid_model_request",
        reason: "invalid_request",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      { statusCode: 422 },
      {
        code: "invalid_model_request",
        reason: "invalid_request",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      { statusCode: 500 },
      {
        code: "model_request_failed",
        reason: "server_error",
        retryReason: "server_error",
        retryable: true,
      },
    ],
    [
      { code: "EPROTO" },
      {
        code: "model_request_failed",
        reason: "tls_error",
        retryReason: "network_error",
        retryable: true,
      },
    ],
    [
      { code: "ERR_PROXY" },
      {
        code: "model_request_failed",
        reason: "proxy_error",
        retryReason: "network_error",
        retryable: true,
      },
    ],
    [
      { code: "ECONNRESET" },
      {
        code: "model_request_failed",
        reason: "network_error",
        retryReason: "network_error",
        retryable: true,
      },
    ],
    [
      {},
      {
        code: "model_request_failed",
        reason: "unknown",
        retryReason: "network_error",
        retryable: false,
      },
    ],
    [
      { isRetryable: true },
      {
        code: "model_request_failed",
        reason: "unknown",
        retryReason: "network_error",
        retryable: true,
      },
    ],
  ];
  for (const [input, expected] of rows) {
    assert.deepEqual(pick(classify(input)), expected, JSON.stringify(expected));
  }
  const withHeaders = classify({
    statusCode: 429,
    responseHeaders: { "retry-after-ms": "1200" },
  });
  assert.equal(withHeaders.retryAfterMs, 1200);
  assert.equal(classify("plain string").message, "plain string");
  assert.equal(classify(null).message, "Model request failed");
  assert.equal(isRetryableFailure({ retryable: true } as never), true);
  assert.equal(isRetryableFailure({ retryable: false } as never), false);
});

function pick(failure: { code: string; reason: string; retryReason: string; retryable: boolean }) {
  return {
    code: failure.code,
    reason: failure.reason,
    retryReason: failure.retryReason,
    retryable: failure.retryable,
  };
}
