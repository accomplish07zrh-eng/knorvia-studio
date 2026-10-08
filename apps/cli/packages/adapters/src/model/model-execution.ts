// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { createAnthropic, anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { compileModelOptionMaps, type ModelOptionValues } from "@knorvia/model-option-map";
import type { Logger, ModelId, ModelProviderId, ModelRequestAuth } from "@knorvia/contracts";
import type { RegistryProviderConfig } from "@knorvia/provider";
import type { RawRequestBodyCapture } from "./model-option-map-fetch.js";
import { mergeModelRequestHeaders } from "./model-request-headers.js";
import { createModelOptionMapFetch } from "./model-option-map-fetch.js";
import { createAnthropicCompatFetch } from "./anthropic-stream-compat.js";
import { createOpenAIResponsesJsonCompatFetch } from "./openai-responses-json-compat.js";
import { isRecord } from "./runner-record.js";
import { createNetworkProxyFetch } from "../network/proxy-fetch.js";

export type AiSdkProviderKind = "openai" | "anthropic" | "openai-compatible";
export type EnvRecord = Record<string, string | undefined>;
export interface AiSdkModelExecutionConfig {
  defaultHeaders?: Readonly<Record<string, string>>;
  env?: EnvRecord;
  network?: AiSdkNetworkConfig;
}
export interface AiSdkModelExecutionOptions {
  logger?: Logger;
  transport?: ProviderFetch;
}
export interface AiSdkNetworkConfig {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
}
export interface AiSdkResolvedModel {
  baseURL?: string;
  headers?: Record<string, string>;
  providerId: ModelProviderId;
  modelId: ModelId;
  model: LanguageModel;
  providerKind: AiSdkProviderKind;
  providerOptions?: Record<string, unknown>;
  rawRequestBodyCapture?: RawRequestBodyCapture;
}
export interface AiSdkBoundModelResolution {
  readonly resolved: AiSdkResolvedModel;
  resolveRequest(input: {
    readonly options: ModelOptionValues;
    readonly requestAuth?: ModelRequestAuth;
  }): AiSdkResolvedModel;
}
type ProviderFetch = typeof globalThis.fetch;
type ProviderCode = string | number;
export interface ProviderBusinessErrorFetchOptions {
  caCertFile?: string;
  env?: EnvRecord;
  providerId: string;
  providerKind: AiSdkProviderKind;
  fetch?: ProviderFetch;
  httpProxy?: string;
  noProxy?: string;
}
export interface ProviderBusinessErrorOptions {
  providerCode?: ProviderCode;
  providerId: string;
  providerKind: AiSdkProviderKind;
  providerMessage?: string;
  providerRequestId?: string;
  responseBodySummary?: Record<string, unknown>;
  responseHeaders?: Record<string, string>;
  responseStatus?: number;
  statusCode?: number;
}
export class ProviderBusinessError extends Error {
  readonly code = "PROVIDER_BUSINESS_ERROR";
  readonly isProviderBusinessError = true;
  readonly providerCode?: ProviderCode;
  readonly providerId!: string;
  readonly providerKind!: AiSdkProviderKind;
  readonly providerMessage?: string;
  readonly providerRequestId?: string;
  readonly responseBodySummary?: Record<string, unknown>;
  readonly responseHeaders?: Record<string, string>;
  readonly responseStatus?: number;
  readonly statusCode?: number;
  constructor(options: ProviderBusinessErrorOptions) {
    super(options.providerMessage ?? `Provider ${options.providerId} rejected the request`);
    this.name = "ProviderBusinessError";
    Object.assign(this, options);
  }
}
export function isProviderBusinessError(error: unknown): error is ProviderBusinessError {
  return (
    error instanceof ProviderBusinessError ||
    (isRecord(error) && error.isProviderBusinessError === true)
  );
}
function stringValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof record[key] === "string") return record[key] as string;
  return undefined;
}
function providerCodeValue(
  record: Record<string, unknown>,
  ...keys: string[]
): ProviderCode | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}
export function readProviderBusinessFailureFromBody(body: unknown):
  | {
      providerCode?: ProviderCode;
      providerMessage?: string;
      providerRequestId?: string;
      responseBodySummary: Record<string, unknown>;
      statusCode?: number;
    }
  | undefined {
  let parsed = body;
  if (typeof body === "string") {
    if (body.length > 64_000) return undefined;
    try {
      parsed = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(parsed) || Array.isArray(parsed)) return undefined;
  const nested = isRecord(parsed.error) && !Array.isArray(parsed.error) ? parsed.error : {};
  const providerCode =
    providerCodeValue(parsed, "providerCode", "error_code", "code") ??
    providerCodeValue(nested, "providerCode", "error_code", "code");
  const providerMessage =
    stringValue(nested, "message", "error") ?? stringValue(parsed, "message", "error");
  const providerRequestId =
    stringValue(nested, "request_id", "requestId", "id") ??
    stringValue(parsed, "request_id", "requestId", "id");
  const statusCode =
    typeof parsed.status === "number"
      ? parsed.status
      : typeof nested.status === "number"
        ? nested.status
        : undefined;
  if (providerCode === undefined && providerMessage === undefined && statusCode === undefined)
    return undefined;
  const summarize = (record: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(record)
        .slice(0, 20)
        .filter(
          ([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value),
        ),
    );
  return {
    providerCode,
    providerMessage: providerMessage?.slice(0, 1000),
    providerRequestId: providerRequestId?.slice(0, 1000),
    responseBodySummary: {
      ...summarize(parsed),
      ...(Object.keys(nested).length ? { error: summarize(nested) } : {}),
    },
    statusCode,
  };
}
export function createProviderBusinessErrorFetch(
  options: ProviderBusinessErrorFetchOptions,
): ProviderFetch {
  const base = createNetworkProxyFetch({
    caCertFile: options.caCertFile,
    env: options.env,
    fetch: options.fetch,
    httpProxy: options.httpProxy,
    noProxy: options.noProxy,
  });
  return async (input, init) => {
    const response = await base(input, init);
    if (response.ok) return response;
    const clone = response.clone();
    const text = await clone.text();
    const failure = readProviderBusinessFailureFromBody(text);
    if (!failure) return response;
    try {
      await response.body?.cancel();
    } catch {
      /* connection cleanup is best effort */
    }
    throw new ProviderBusinessError({
      ...failure,
      providerId: options.providerId,
      providerKind: options.providerKind,
      responseHeaders: Object.fromEntries(response.headers),
      responseStatus: response.status,
      statusCode: failure.statusCode ?? response.status,
    });
  };
}

export class AiSdkModelExecution {
  private readonly config: AiSdkModelExecutionConfig;
  private readonly transport?: ProviderFetch;
  constructor(config: AiSdkModelExecutionConfig = {}, options: AiSdkModelExecutionOptions = {}) {
    this.config = config;
    this.transport = options.transport;
  }
  bindModel(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly providerConfig: RegistryProviderConfig;
    readonly supportsJsonSchemaOutput: boolean;
    readonly optionSpecs: {
      readonly reasoningLevel: { readonly map: string };
      readonly maxOutputTokens: { readonly map: string };
    };
  }): AiSdkBoundModelResolution {
    const config = input.providerConfig as unknown as Record<string, unknown>;
    const api = isRecord(config.api) ? config.api : {};
    const access = isRecord(config.access) ? config.access : {};
    const apiFormat = String(api.type ?? "openai-chat-completions");
    const providerKind: AiSdkProviderKind =
      apiFormat === "anthropic-messages"
        ? "anthropic"
        : apiFormat === "openai-responses"
          ? "openai"
          : apiFormat === "openai-chat-completions"
            ? "openai-compatible"
            : (() => {
                throw new Error(`Unsupported provider API format: ${apiFormat}`);
              })();
    const baseURL = typeof api.baseUrl === "string" ? api.baseUrl : undefined;
    const staticHeaders = isRecord(api.headers)
      ? (api.headers as Record<string, string>)
      : undefined;
    const staticKey = typeof access.apiKey === "string" ? access.apiKey : undefined;
    const providerOptions = isRecord(config.providerOptions) ? config.providerOptions : undefined;
    const maps = compileModelOptionMaps(input.optionSpecs);
    const resolve = (
      requestAuth?: ModelRequestAuth,
      values?: ModelOptionValues,
    ): AiSdkResolvedModel => {
      const apiKey = requestAuth?.apiKey ?? staticKey;
      const headers = mergeModelRequestHeaders(
        this.config.defaultHeaders,
        staticHeaders,
        requestAuth?.headers,
      );
      if (
        providerKind === "anthropic" &&
        !Object.keys(headers).some((key) => key.toLowerCase() === "authorization") &&
        apiKey
      )
        headers.Authorization = `Bearer ${apiKey}`;
      const capture: RawRequestBodyCapture = {};
      const businessFetch = createProviderBusinessErrorFetch({
        ...this.config.network,
        env: this.config.env,
        providerId: input.providerId,
        providerKind,
        fetch: this.transport,
      });
      const compatibleFetch =
        providerKind === "anthropic"
          ? createAnthropicCompatFetch(businessFetch)
          : providerKind === "openai"
            ? createOpenAIResponsesJsonCompatFetch(businessFetch)
            : businessFetch;
      const fetch = values
        ? createModelOptionMapFetch({ capture, fetch: compatibleFetch, maps, values })
        : compatibleFetch;
      let model: LanguageModel;
      if (providerKind === "anthropic") {
        const trimmedBaseURL = baseURL?.replace(/\/$/, "");
        const anthropicBaseURL = trimmedBaseURL
          ? `${trimmedBaseURL}${trimmedBaseURL.endsWith("/v1") ? "" : "/v1"}`
          : undefined;
        model = (
          baseURL || apiKey
            ? createAnthropic({
                ...(anthropicBaseURL ? { baseURL: anthropicBaseURL } : {}),
                apiKey,
                headers,
                fetch,
              })
            : anthropic
        )(input.modelId);
      } else if (providerKind === "openai")
        model = createOpenAI({ baseURL, apiKey, headers, fetch }).responses(input.modelId);
      else
        model = createOpenAICompatible({
          name: input.providerId,
          baseURL: baseURL ?? "",
          apiKey,
          headers,
          fetch,
          // 修复对话底部 token／缓存命中不随轮次变化：OpenAI 兼容端点只有在请求
          // stream_options.include_usage 时才在流末尾返回用量，否则累计值恒加 0。
          includeUsage: true,
        })(input.modelId);
      return {
        baseURL,
        headers,
        providerId: input.providerId as ModelProviderId,
        modelId: input.modelId as ModelId,
        model,
        providerKind,
        providerOptions,
        rawRequestBodyCapture: capture,
      };
    };
    const placeholder = resolve(undefined);
    return {
      resolved: placeholder,
      resolveRequest: ({ options, requestAuth }) => resolve(requestAuth, options),
    };
  }
}
