// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// HTTP 代理与 TLS 的形状声明：仅由 http-config.ts 内部使用，不对外新增导出。
// 字段说明（调用方按这些字段构造对象，因此字段名是契约）：
// env：环境变量快照，用于解析 KNORVIA_ HTTP_PROXY / NO_PROXY / CA 证书配置。
// httpProxy / noProxy：显式覆盖环境变量推导出的代理与绕过规则。
// caCertFile：自定义 CA 证书文件路径。
// NetworkProxyResolution 描述一次解析结果：是否命中绕过规则、代理来源与最终 URL。
// BypassRule 是 no_proxy 条目的规范化形式：主机名 + 可选端口。

export interface NetworkProxyOptions {
  env?: Record<string, string | undefined>;
  httpProxy?: string;
  noProxy?: string;
}

export interface NetworkTlsOptions {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
}

export interface NetworkProxyResolution {
  noProxyMatched: boolean;
  proxySource?: string;
  proxyUrl?: string;
}

export interface BypassRule {
  host: string;
  port?: string;
}
