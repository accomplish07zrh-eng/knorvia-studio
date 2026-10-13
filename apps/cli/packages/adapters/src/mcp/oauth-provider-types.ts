// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 令牌提供者的输入形状：新模块导出、实现文件仅内部导入（原本就不是公开导出）。
// 字段说明（字段名由调用方构造对象决定）：
// config：authorization_code 类型的 OAuth 配置（clientId/scope/redirectPath 等）。
// credentialStore / keyPrefix：凭据落点与命名空间前缀。
// fetchFn：可注入的 fetch，用于刷新令牌。
// logger / serverName / serverUrl：日志与诊断标识。

import type { FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

export interface CreateMcpOAuthTokenProviderInput {
  config: McpAuthorizationCodeOAuthConfig;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  keyPrefix: string;
  logger?: Logger;
  serverName: string;
  serverUrl: string;
}
