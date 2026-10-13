// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 交互式授权的形状声明：导出的结果联合由 oauth-interactive.ts 原样再导出，公开面不变。
// 字段说明：McpInteractiveAuthorizationOutcome 四态（authorized / already-authorized / pending / failed ✓）；
// McpInteractiveAuthorizationInput 是调用方构造的入参（字段名是契约 ✓，本模块导出供实现导入 ✓）。

import type { FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { McpOAuthAuthorizationContext } from "./oauth-shared.js";

export type McpInteractiveAuthorizationOutcome =
  | { status: "authorized" }
  | { status: "already-authorized" }
  | { status: "pending"; authorizationUrl?: string }
  | { status: "failed"; error: unknown };

export interface McpInteractiveAuthorizationInput {
  adapterInstanceId?: string;
  config: Extract<McpOAuthConfig, { type: "authorization_code" }>;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  forceReauthorization?: boolean;
  keyPrefix: string;
  logger?: Logger;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  requestedScope?: string;
  resourceMetadataUrl?: URL;
  serverName: string;
  serverUrl: string;
  signal?: AbortSignal;
  transactionTtlMs?: number;
}
