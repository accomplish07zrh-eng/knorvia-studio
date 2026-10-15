// SPDX-License-Identifier: Apache-2.0
// provider 路由内核：API 格式 → SDK 种类（路由表）、请求头合并与 anthropic Authorization 注入、
// anthropic 端点归一（补 /v1）、三种 SDK 构造分派。语义由 B1–B3 锁定，与被替换实现等价。

import { createAnthropic, anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelRequestAuth } from "@knorvia/contracts";
import type { RegistryProviderConfig } from "@knorvia/provider";
import { isRecord } from "../runner-record.js";
import { mergeModelRequestHeaders } from "../model-request-headers.js";
import type { AiSdkModelExecutionConfig, AiSdkProviderKind } from "./execution-contract.js";

type ProviderFetch = typeof globalThis.fetch;

// API 格式 → SDK 种类路由表（缺省按 openai-chat-completions）
const KIND_BY_API_TYPE: Record<string, AiSdkProviderKind> = {
  "anthropic-messages": "anthropic",
  "openai-responses": "openai",
  "openai-chat-completions": "openai-compatible",
};
const DEFAULT_API_TYPE = "openai-chat-completions";

export interface ProviderShim {
  kind: AiSdkProviderKind;
  baseURL?: string;
  headers: Record<string, string>;
  apiKey?: string; // 请求期键优先，缺省用静态键（可缺省）
  providerOptions?: Record<string, unknown>; // 绑定级 provider 选项
  providerId: string; // SDK name 用（openai-compatible）
}

export function readProviderShim(
  providerConfig: RegistryProviderConfig,
  requestAuth: ModelRequestAuth | undefined,
  executionConfig: AiSdkModelExecutionConfig,
  providerId: string,
): ProviderShim {
  const config = providerConfig as unknown as Record<string, unknown>;
  const api = isRecord(config.api) ? config.api : {};
  const access = isRecord(config.access) ? config.access : {};
  const apiType = String(api.type ?? DEFAULT_API_TYPE);
  const kind = KIND_BY_API_TYPE[apiType];
  if (!kind) throw new Error(`Unsupported provider API format: ${apiType}`);
  const baseURL = typeof api.baseUrl === "string" ? api.baseUrl : undefined;
  const staticKey = typeof access.apiKey === "string" ? access.apiKey : undefined;
  const apiKey = requestAuth?.apiKey ?? staticKey;
  const staticHeaders = isRecord(api.headers) ? (api.headers as Record<string, string>) : undefined;
  const headers = mergeModelRequestHeaders(
    executionConfig.defaultHeaders as Record<string, string> | undefined,
    staticHeaders,
    requestAuth?.headers,
  );
  const hasAuthorization = Object.keys(headers).some(
    (key) => key.toLowerCase() === "authorization",
  );
  if (kind === "anthropic" && !hasAuthorization && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const providerOptions = isRecord(config.providerOptions)
    ? (config.providerOptions as Record<string, unknown>)
    : undefined;
  return { kind, baseURL, headers, apiKey, providerOptions, providerId };
}

export function normalizeAnthropicBase(baseURL: string): string {
  const trimmed = baseURL.replace(/\/$/u, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function anthropicModel(shim: ProviderShim, modelId: string, wire: ProviderFetch): LanguageModel {
  const base = shim.baseURL ? normalizeAnthropicBase(shim.baseURL) : undefined;
  const factory =
    base === undefined && shim.apiKey === undefined
      ? anthropic
      : createAnthropic({ baseURL: base, apiKey: shim.apiKey, headers: shim.headers, fetch: wire });
  return factory(modelId) as LanguageModel;
}

function openaiResponsesModel(
  shim: ProviderShim,
  modelId: string,
  wire: ProviderFetch,
): LanguageModel {
  return createOpenAI({
    baseURL: shim.baseURL,
    apiKey: shim.apiKey,
    headers: shim.headers,
    fetch: wire,
  }).responses(modelId) as LanguageModel;
}

function compatibleChatModel(
  shim: ProviderShim,
  modelId: string,
  wire: ProviderFetch,
): LanguageModel {
  return createOpenAICompatible({
    name: shim.providerId,
    baseURL: shim.baseURL ?? "",
    apiKey: shim.apiKey ?? "",
    headers: shim.headers,
    fetch: wire,
    includeUsage: true, // OpenAI 兼容端点只有带 include_usage 才回传用量
  })(modelId) as LanguageModel;
}

export function buildLanguageModel(
  shim: ProviderShim,
  modelId: string,
  wire: ProviderFetch,
): LanguageModel {
  if (shim.kind === "anthropic") return anthropicModel(shim, modelId, wire);
  if (shim.kind === "openai") return openaiResponsesModel(shim, modelId, wire);
  return compatibleChatModel(shim, modelId, wire);
}
