// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 凭据命名空间与运行期选项：令牌按「服务 + 授权配置」分片存放，互不串用。
// 命名空间规则：
// 一、参与摘要的五段依次为服务名、服务 URL、clientId、scope、redirectPath（缺省按空串）。
// 二、段间用换行分隔后整体取 SHA-256，再截取前 24 位十六进制作为命名空间。
// 三、任意一段变化都会得到新命名空间，旧令牌因此不会被新配置误用。
// 四、前缀固定为 mcp:oauth:，便于人工排查凭据文件时按前缀识别来源。

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

/** 摘要输入：五段以换行拼接，缺省值统一按空串参与，避免 undefined 影响摘要。 */
function namespaceParts(
  serverName: string,
  serverUrl: string,
  config: McpAuthorizationCodeOAuthConfig,
): string {
  const segments = [
    serverName,
    serverUrl,
    config.clientId ?? "",
    config.scope ?? "",
    config.redirectPath ?? "",
  ];
  return segments.join(NAMESPACE_SEPARATOR);
}

function digestOf(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createCredentialKeyPrefix(
  serverName: string,
  serverUrl: string,
  config: McpAuthorizationCodeOAuthConfig,
): string {
  const hash = digestOf(namespaceParts(serverName, serverUrl, config));
  return `${NAMESPACE_PREFIX}${hash.slice(0, NAMESPACE_DIGEST_LENGTH)}`;
}

/** 运行期选项类型在此一并可见，调用方既可从此处引入，也可直接引用 oauth-types。 */
