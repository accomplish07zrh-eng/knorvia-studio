// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
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
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
export function isProviderBusinessError(error: unknown): error is ProviderBusinessError {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function readProviderBusinessFailureFromBody(body: unknown):
  | {
      providerCode?: ProviderCode;
      providerMessage?: string;
      providerRequestId?: string;
      responseBodySummary: Record<string, unknown>;
      statusCode?: number;
    }
  | undefined;
export function createProviderBusinessErrorFetch(
  options: ProviderBusinessErrorFetchOptions,
): ProviderFetch {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export class AiSdkModelExecution {
  private readonly config: AiSdkModelExecutionConfig;
  private readonly transport?: ProviderFetch;
  constructor(config: AiSdkModelExecutionConfig = {}, options: AiSdkModelExecutionOptions = {}) {
    throw new Error("not implemented: apps-cli-packages-01-model");
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
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
