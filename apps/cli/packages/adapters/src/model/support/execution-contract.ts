// SPDX-License-Identifier: Apache-2.0
// 执行装配的契约形状：SDK 种类、执行配置/选项、网络配置、解析结果、业务错误入参。
// 名称与形状是兼容面（model-execution.ts 再导出），字段语义见 behavior.md B1–B6。

import type { LanguageModel } from "ai";
import type { Logger, ModelId, ModelProviderId, ModelRequestAuth } from "@knorvia/contracts";
import type { RawRequestBodyCapture } from "../model-option-map-fetch.js";

export type AiSdkProviderKind = "openai" | "anthropic" | "openai-compatible";
export type EnvRecord = Record<string, string | undefined>;
type HeaderBag = Readonly<Record<string, string>>;
type MutableHeaders = Record<string, string>;
type ProviderFetch = typeof globalThis.fetch;
export type ProviderCode = string | number;

export interface AiSdkModelExecutionConfig {
  defaultHeaders?: HeaderBag; // 附加默认头
  env?: EnvRecord; // 环境变量表（代理/证书依据）
  network?: AiSdkNetworkConfig; // 代理/证书配置
}

export interface AiSdkModelExecutionOptions {
  logger?: Logger; // 诊断日志口
  transport?: ProviderFetch; // 注入传输（测试/代理链路）
}

export interface AiSdkNetworkConfig {
  caCertFile?: string; // CA 证书文件
  httpProxy?: string; // HTTP 代理地址
  noProxy?: string; // 代理绕过清单
}

export interface AiSdkResolvedModel {
  baseURL?: string; // 端点（provider 归一后）
  headers?: MutableHeaders; // 合并后的请求头
  providerId: ModelProviderId; // provider 身份
  modelId: ModelId; // 模型身份
  model: LanguageModel; // SDK 模型实例
  providerKind: AiSdkProviderKind; // SDK 种类
  providerOptions?: Record<string, unknown>; // provider 侧选项
  rawRequestBodyCapture?: RawRequestBodyCapture; // 原始请求体留档出口
}

export interface AiSdkBoundModelResolution {
  readonly resolved: AiSdkResolvedModel; // 绑定期占位解析
  resolveRequest(input: {
    readonly options: import("@knorvia/model-option-map").ModelOptionValues;
    readonly requestAuth?: ModelRequestAuth;
  }): AiSdkResolvedModel; // 请求期解析（带鉴权与选项）
}

export interface ProviderBusinessErrorFetchOptions {
  caCertFile?: string; // CA 证书文件
  env?: EnvRecord; // 环境变量表
  providerId: string; // provider 身份
  providerKind: AiSdkProviderKind; // SDK 种类
  fetch?: ProviderFetch; // 底层传输
  httpProxy?: string; // HTTP 代理地址
  noProxy?: string; // 代理绕过清单
}

export interface ProviderBusinessErrorOptions {
  providerCode?: ProviderCode; // provider 业务码
  providerId: string; // provider 身份
  providerKind: AiSdkProviderKind; // SDK 种类
  providerMessage?: string; // provider 消息
  providerRequestId?: string; // provider 请求 id
  responseBodySummary?: Record<string, unknown>; // 体摘要
  responseHeaders?: MutableHeaders; // 响应头
  responseStatus?: number; // 响应状态
  statusCode?: number; // HTTP 状态（体优先）
}
