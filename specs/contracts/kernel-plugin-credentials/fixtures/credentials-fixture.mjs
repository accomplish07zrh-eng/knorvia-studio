// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials 固定夹具：虚构供应商配置与虚构凭据占位值。
//
// 安全红线（本包最严）：夹具里的凭据一律是**一眼可辨的虚构值**，不得模仿任何真实 key 的
// 前缀或长度。真实 key 格式的假值容易被误认为泄漏、会触发凭据扫描告警，也不利于审查者判断。
//
// 本文件同时是契约测试与录制共用的唯一来源，保证两边用的是同一批虚构数据。

/**
 * 虚构 API key。
 *
 * 刻意不使用 `sk-` 之类真实前缀，也不采用真实 key 的**形态**（`sk-` + 32/48 位十六进制）——
 * 审查者看到它应当立刻判定为假值。
 *
 * **判据是形态而不是长度**：`fixture-api-key-0001` 恰好 20 字符，与某些真实 key 长度接近，
 * 单纯用长度做断言会既脆弱又自相矛盾。B11 断言的是「不含真实前缀 + 含 fixture- 标记」。
 */
export const FIXTURE_API_KEY = "fixture-api-key-0001";

/** 虚构 header 值（用于「只有 headers、没有 apiKey」的映射分支）。 */
export const FIXTURE_HEADER_VALUE = "fixture-header-value";

/** 虚构的自定义 header 名（合法的 HTTP 字段名，但不属于任何真实供应商）。 */
export const FIXTURE_HEADER_NAME = "x-knorvia-fixture-header";

/** 虚构 workspace 引用（路径是占位符，不指向任何真实目录）。 */
export const FIXTURE_WORKSPACE = {
  workspacePath: "/fixture/workspace",
  workspaceKey: "/fixture/workspace",
};

/** 虚构 model selection。 */
export const FIXTURE_MODEL_SELECTION = {
  providerId: "fixture-provider",
  modelId: "fixture-model",
};

/**
 * 三种协议格式各一条虚构供应商配置。
 *
 * 覆盖 B4 的三条分支：openai-completions / openai-responses / anthropic-messages。
 * 端点用保留域名 `example.invalid`（RFC 2606 规定 `.invalid` 永不解析），因此**不可能**
 * 意外连到真实服务——即使某个用例忘了打桩。
 */
export function buildFixtureProviders() {
  return [
    {
      providerId: "fixture-openai-completions",
      protocol: "openai-completions",
      baseURL: "https://fixture-openai-completions.example.invalid/v1",
      displayName: "Fixture OpenAI-compatible",
      models: [{ modelId: "fixture-model-a", contextWindow: 128_000, maxOutputTokens: 8_192 }],
    },
    {
      providerId: "fixture-openai-responses",
      protocol: "openai-responses",
      baseURL: "https://fixture-openai-responses.example.invalid/v1",
      models: [{ modelId: "fixture-model-b", reasoning: true }],
    },
    {
      providerId: "fixture-anthropic-messages",
      protocol: "anthropic-messages",
      baseURL: "https://fixture-anthropic-messages.example.invalid",
      displayName: "Fixture Anthropic",
      models: [{ modelId: "fixture-model-c" }],
    },
  ];
}

/**
 * 四种凭据应答（对应 interface.md §2.4 的四条映射分支）。
 *
 * `headersApplied: false` 那条用于 B6 的「明确失败」断言。
 */
export const FIXTURE_CREDENTIAL_REPLIES = {
  /** 只有 apiKey。 */
  apiKeyOnly: { headersApplied: true, requestAuth: { apiKey: FIXTURE_API_KEY } },
  /** apiKey + headers。 */
  apiKeyAndHeaders: {
    headersApplied: true,
    requestAuth: {
      apiKey: FIXTURE_API_KEY,
      headers: { [FIXTURE_HEADER_NAME]: FIXTURE_HEADER_VALUE },
    },
  },
  /** 只有 headers、没有 apiKey（D2 记录的边界：headers 无法按请求注入）。 */
  headersOnly: {
    headersApplied: true,
    requestAuth: { headers: { [FIXTURE_HEADER_NAME]: FIXTURE_HEADER_VALUE } },
  },
  /** 失败应答（B6：必须明确失败）。 */
  refused: { headersApplied: false, errorMessage: "fixture-credential-unavailable" },
};

/** `interaction/requestProviderRuntimeHeaders` 的虚构请求参数（过既有 schema）。 */
export function buildFixtureRuntimeHeadersRequest(overrides = {}) {
  return {
    requestId: "fixture-request-0001",
    sessionId: "sess_fixture_0001",
    workspace: FIXTURE_WORKSPACE,
    modelSelection: FIXTURE_MODEL_SELECTION,
    providerId: FIXTURE_MODEL_SELECTION.providerId,
    reason: "model-request",
    ...overrides,
  };
}
