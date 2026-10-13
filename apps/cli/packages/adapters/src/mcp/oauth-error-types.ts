// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 错误形状：导出的取值联合与触发信息接口由 oauth-errors.ts 原样再导出，公开面不变。
// 约定：reason 取值是契约（新增取值需同步消费方）；两个可选字段只在有值时出现（缺席即不适用）。

export type McpOAuthInteractiveRequiredReason =
  | "no_credentials"
  | "no_refresh_token"
  | "invalid_grant"
  | "invalid_client"
  | "insufficient_scope"
  | "unauthorized"
  | "legacy_provider_seam";

export interface InteractiveAuthorizationTrigger {
  reason: McpOAuthInteractiveRequiredReason;
  requiredScope?: string;
  resourceMetadataUrl?: string;
}

export interface CreateInteractiveAuthorizationErrorInput extends InteractiveAuthorizationTrigger {
  cause?: unknown;
  serverName: string;
}
