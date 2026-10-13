// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 授权上下文形状：由 oauth-shared.ts 原样再导出，公开面不变。
// 字段说明（字段名是契约）：authorizationUrl 授权地址；redirectUrl 回环回调地址；serverName 服务名。

export interface McpOAuthAuthorizationContext {
  authorizationUrl: string;
  redirectUrl: string;
  serverName: string;
}
