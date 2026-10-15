// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// MCP OAuth 运行期选项的形状声明：由 oauth.ts 原样再导出，公开面不变。
// 字段说明（字段名是契约）：
// authorizationTimeoutMs：等待用户完成授权的上限。
// credentialStore：共享凭据存储实例，OAuth 令牌落在其中。
// onAuthorizationRequired / openAuthorizationUrl：需要授权时的回调（提示与打开浏览器）。

import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { McpOAuthAuthorizationContext } from "./oauth-shared.js";

export interface McpOAuthRuntimeOptions {
  authorizationTimeoutMs?: number;
  credentialStore?: SharedKnorviaCredentialStore;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
}
