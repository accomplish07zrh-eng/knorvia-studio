// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Node HTTP 客户端适配器的形状声明：由 http/index.ts 原样再导出，公开面不变。
// 字段说明（调用方按这些字段构造对象，字段名是契约）：
// env：环境变量快照，用于代理/CA/工具透传统一解析。
// timeoutMs / maxResponseBytes：超时与响应体上限。
// proxyUrl / noProxy / caCertFile：显式覆盖代理与自定义 CA。
// dnsLookup：可注入解析器，用于出口策略校验。
// capturedUserProxyEnvFallback：是否在无显式配置时回退工具透传环境。

import type { DnsLookup } from "./public-egress-policy.js";

export interface NodeHttpClientAdapterOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  proxyUrl?: string;
  noProxy?: string;
  caCertFile?: string;
  dnsLookup?: DnsLookup;
  capturedUserProxyEnvFallback?: boolean;
}
