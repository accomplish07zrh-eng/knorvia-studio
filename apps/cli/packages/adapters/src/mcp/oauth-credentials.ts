// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/client";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";

export const MCP_OAUTH_CANONICAL_CREDENTIALS_KEY = "authorization_credentials";
export const MCP_OAUTH_CREDENTIALS_VERSION = 2;
export const MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS = new Set<number>([1, 2]);

const CLIENT_KEY = "client_information";
const TOKENS_KEY = "tokens";
const GENERATION_BYTES = 16;
const LEGACY_DIGEST_LENGTH = 32;
const EXPIRY_SKEW_MS = 30_000;
const MILLISECONDS_PER_SECOND = 1_000;

export interface McpOAuthCanonicalCredentials {
  client_information: OAuthClientInformationMixed;
  expires_at?: number;
  generation?: string;
  issuer?: string;
  obtained_at?: number;
  published_by: string;
  tokens: OAuthTokens;
  version: 1 | typeof MCP_OAUTH_CREDENTIALS_VERSION;
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

interface PublishCanonicalCredentialsInput {
  clientInformation: OAuthClientInformationMixed;
  issuer?: string;
  obtainedAt?: number;
  publishedBy: string;
  tokens: OAuthTokens;
}

interface PublishedCanonicalCredentials {
  canonical: McpOAuthCanonicalCredentials;
  generation: string;
  legacyClientRaw: string;
  legacyTokensRaw: string;
  raw: string;
}

type CanonicalInvalidationScope = "tokens" | "all";

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

export function mcpOAuthCredentialKey(keyPrefix: string, name: string): string {
  return `${keyPrefix}:${name}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCanonicalCredentials(value: unknown): value is McpOAuthCanonicalCredentials {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS.has(value.version) &&
    typeof value.published_by === "string" &&
    value.published_by.length > 0 &&
    isRecord(value.client_information) &&
    isRecord(value.tokens) &&
    typeof value.client_information.client_id === "string" &&
    typeof value.tokens.access_token === "string" &&
    typeof value.tokens.token_type === "string"
  );
}

function parseRaw(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function generationFor(canonical: McpOAuthCanonicalCredentials, raw: string): string {
  if (typeof canonical.generation === "string" && canonical.generation.length > 0) {
    return canonical.generation;
  }
  const digest = createHash("sha256").update(raw).digest("hex");
  return `legacy-${digest.slice(0, LEGACY_DIGEST_LENGTH)}`;
}

function canonicalFields(
  canonical: McpOAuthCanonicalCredentials,
  readRaw: () => string,
): Omit<CanonicalCredentialSnapshot, "tokens"> {
  return {
    clientInformation: canonical.client_information,
    ...(canonical.expires_at !== undefined ? { expiresAt: canonical.expires_at } : {}),
    generation: generationFor(canonical, readRaw()),
    ...(canonical.issuer !== undefined ? { issuer: canonical.issuer } : {}),
    ...(canonical.obtained_at !== undefined ? { obtainedAt: canonical.obtained_at } : {}),
    raw: readRaw(),
  };
}

export async function loadCanonicalCredentials(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
): Promise<CanonicalCredentialSnapshot | undefined> {
  const raw = await credentialStore.load(
    mcpOAuthCredentialKey(keyPrefix, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY),
  );
  if (!raw) return undefined;
  const canonical = parseRaw(raw);
  if (!isCanonicalCredentials(canonical)) return undefined;
  return { ...canonicalFields(canonical, () => raw), tokens: canonical.tokens };
}

export async function publishCanonicalCredentials(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
  input: PublishCanonicalCredentialsInput,
): Promise<PublishedCanonicalCredentials> {
  const obtainedAt = input.obtainedAt ?? Date.now();
  let expiresAt: number | undefined;
  if (typeof input.tokens.expires_in === "number" && Number.isFinite(input.tokens.expires_in)) {
    expiresAt = obtainedAt + input.tokens.expires_in * MILLISECONDS_PER_SECOND;
  }
  const generation = randomBytes(GENERATION_BYTES).toString("hex");
  const canonical: McpOAuthCanonicalCredentials = {
    client_information: input.clientInformation,
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    generation,
    ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
    obtained_at: obtainedAt,
    published_by: input.publishedBy,
    tokens: input.tokens,
    version: MCP_OAUTH_CREDENTIALS_VERSION,
  };
  // 三次序列化先完成，保留各次输入读取及 toJSON 的失败顺序，不补造缺失文本。
  const raw = JSON.stringify(canonical);
  const legacyClientRaw = JSON.stringify(input.clientInformation);
  const legacyTokensRaw = JSON.stringify(input.tokens);
  await credentialStore.saveMany({
    [mcpOAuthCredentialKey(keyPrefix, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY)]: raw,
    [mcpOAuthCredentialKey(keyPrefix, CLIENT_KEY)]: legacyClientRaw,
    [mcpOAuthCredentialKey(keyPrefix, TOKENS_KEY)]: legacyTokensRaw,
  });
  return { canonical, generation, legacyClientRaw, legacyTokensRaw, raw };
}

export function isCanonicalTokenNearExpiry(
  snapshot: Pick<CanonicalCredentialSnapshot, "expiresAt">,
  now = Date.now(),
  skewMs = EXPIRY_SKEW_MS,
): boolean {
  return snapshot.expiresAt === undefined || now >= snapshot.expiresAt - skewMs;
}

export async function invalidateCanonicalCredentials(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
  expectedRaw: string,
  scope: CanonicalInvalidationScope,
): Promise<boolean> {
  const canonicalKey = mcpOAuthCredentialKey(keyPrefix, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY);
  const keys = [canonicalKey, mcpOAuthCredentialKey(keyPrefix, TOKENS_KEY)];
  if (scope === "all") keys.push(mcpOAuthCredentialKey(keyPrefix, CLIENT_KEY));
  return await credentialStore.deleteManyIfValue(canonicalKey, expectedRaw, keys);
}

export function deriveCredentialPair(input: {
  canonicalRaw?: string;
  legacyClientRaw?: string;
  legacyTokensRaw?: string;
}): CredentialPairSnapshot | undefined {
  const parsedCanonical = parseRaw(input.canonicalRaw);
  const canonical =
    parsedCanonical !== undefined && isCanonicalCredentials(parsedCanonical)
      ? parsedCanonical
      : undefined;
  // 旧镜像的 JSON 弱值是既有协议；类型断言不增加运行时校验或净化。
  const legacyClient = parseRaw(input.legacyClientRaw) as OAuthClientInformationMixed | undefined;
  const legacyTokens = parseRaw(input.legacyTokensRaw) as OAuthTokens | undefined;

  if (canonical && input.canonicalRaw) {
    // raw 的三次后续读取各有既定位置，且快照必须先于镜像分支完成。
    const snapshot: CredentialPairSnapshot = {
      ...canonicalFields(canonical, () => input.canonicalRaw as string),
      source: "canonical",
      tokens: canonical.tokens,
    };
    if (canonical.version === 1) {
      if (
        legacyTokens !== undefined &&
        (!legacyClient || isDeepStrictEqual(legacyClient, canonical.client_information))
      ) {
        return {
          clientInformation: legacyClient ?? canonical.client_information,
          source: "legacy",
          tokens: legacyTokens,
        };
      }
      return snapshot;
    }
    if (!legacyTokens) return { clientInformation: legacyClient, source: "legacy" };
    if (isDeepStrictEqual(legacyTokens, canonical.tokens)) {
      return legacyClient ? snapshot : { source: "legacy", tokens: legacyTokens };
    }
    if (legacyClient && isDeepStrictEqual(legacyClient, canonical.client_information)) {
      return { clientInformation: legacyClient, source: "legacy", tokens: legacyTokens };
    }
    return { clientInformation: legacyClient, source: "legacy" };
  }

  if (!legacyClient && !legacyTokens) return undefined;
  return {
    clientInformation: legacyClient,
    source: "legacy",
    ...(legacyTokens ? { tokens: legacyTokens } : {}),
  };
}

export async function loadCredentialPair(
  credentialStore: SharedKnorviaCredentialStore,
  keyPrefix: string,
): Promise<CredentialPairSnapshot | undefined> {
  const canonicalKey = mcpOAuthCredentialKey(keyPrefix, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY);
  const clientKey = mcpOAuthCredentialKey(keyPrefix, CLIENT_KEY);
  const tokensKey = mcpOAuthCredentialKey(keyPrefix, TOKENS_KEY);
  const snapshot = await credentialStore.loadMany([canonicalKey, clientKey, tokensKey]);
  return deriveCredentialPair({
    canonicalRaw: snapshot[canonicalKey] ?? undefined,
    legacyClientRaw: snapshot[clientKey] ?? undefined,
    legacyTokensRaw: snapshot[tokensKey] ?? undefined,
  });
}
