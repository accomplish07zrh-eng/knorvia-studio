// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 凭据的形状声明：导出的三个类型由 oauth-credentials.ts 原样再导出，公开面不变。
// 字段说明：McpOAuthCanonicalCredentials 是落盘结构（版本/发布者/generation ✓）；
// CanonicalCredentialSnapshot 是读取结果（含 raw 文本 ✓）；
// CredentialPairSnapshot 是「canonical 或 legacy 二选一」的统一视图（source 标注来源 ✓）。

import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/client";

export interface McpOAuthCanonicalCredentials {
  client_information: OAuthClientInformationMixed;
  expires_at?: number;
  generation?: string;
  issuer?: string;
  obtained_at?: number;
  published_by: string;
  tokens: OAuthTokens;
  version: 1 | 2;
}

export interface CanonicalCredentialSnapshot {
  clientInformation: OAuthClientInformationMixed;
  expiresAt?: number;
  generation: string;
  issuer?: string;
  obtainedAt?: number;
  raw: string;
  tokens: OAuthTokens;
}

export interface PublishCanonicalCredentialsInput {
  clientInformation: OAuthClientInformationMixed;
  issuer?: string;
  obtainedAt?: number;
  publishedBy: string;
  tokens: OAuthTokens;
}

export interface PublishedCanonicalCredentials {
  canonical: McpOAuthCanonicalCredentials;
  generation: string;
  legacyClientRaw: string;
  legacyTokensRaw: string;
  raw: string;
}

export type CanonicalInvalidationScope = "tokens" | "all";

export interface CredentialPairSnapshot {
  clientInformation?: OAuthClientInformationMixed;
  expiresAt?: number;
  generation?: string;
  issuer?: string;
  obtainedAt?: number;
  raw?: string;
  source: "canonical" | "legacy";
  tokens?: OAuthTokens;
}
