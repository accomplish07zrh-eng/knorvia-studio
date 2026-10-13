// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 凭据命名空间与运行期选项：令牌按「服务 + 授权配置」分片存放，互不串用。
// 命名空间规则：
// 一、参与摘要的五段依次为服务名、服务 URL、clientId、scope、redirectPath（缺省按空串）。
// 二、段间用换行分隔后整体取 SHA-256，再截取前 24 位十六进制作为命名空间。
// 三、任意一段变化都会得到新命名空间，旧令牌因此不会被新配置误用。
// 四、前缀固定为 mcp:oauth:，便于人工排查凭据文件时按前缀识别来源。
// 五、缺省值统一按空串参与摘要，不让 undefined 与 "" 产生两个不同命名空间。
// 六、摘要长度取 24 位十六进制（96 bit）：冲突概率足够低，同时便于人工核对。
// 七、命名空间只参与凭据键名，不含任何授权端点或令牌内容。

import { createHash } from "node:crypto";
import type { McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { McpOAuthAuthorizationContext } from "./oauth-shared.js";
import type { McpOAuthRuntimeOptions } from "./oauth-types.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

const NAMESPACE_DIGEST_LENGTH = 24;
const NAMESPACE_SEPARATOR = "\n";
const NAMESPACE_PREFIX = "mcp:oauth:";

export type { McpOAuthAuthorizationContext };
export type { McpOAuthRuntimeOptions } from "./oauth-types.js";

// 摘要输入：顺序即摘要顺序，调整顺序会让既有令牌失效。
function namespaceInput(parts: readonly (string | undefined)[]): string {
  return parts.map((part) => part ?? "").join(NAMESPACE_SEPARATOR);
}

export function createCredentialKeyPrefix(
  serviceName: string,
  serviceUrl: string,
  oauthConfig: McpAuthorizationCodeOAuthConfig,
): string {
  const parts = [
    serviceName,
    serviceUrl,
    oauthConfig.clientId,
    oauthConfig.scope,
    oauthConfig.redirectPath,
  ];
  const digest = createHash("sha256").update(namespaceInput(parts));
  return NAMESPACE_PREFIX + digest.digest("hex").slice(0, NAMESPACE_DIGEST_LENGTH);
}
