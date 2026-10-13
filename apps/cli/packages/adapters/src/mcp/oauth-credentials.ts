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

export type {
  CanonicalCredentialSnapshot,
  CredentialPairSnapshot,
  McpOAuthCanonicalCredentials,
} from "./oauth-credentials-types.js";

import type {
  CanonicalCredentialSnapshot,
  CanonicalInvalidationScope,
  CredentialPairSnapshot,
  McpOAuthCanonicalCredentials,
  PublishCanonicalCredentialsInput,
  PublishedCanonicalCredentials,
} from "./oauth-credentials-types.js";

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

/** canonical 版本 2 的决策上下文：一次算好全部匹配位，交给决策表。 */
interface DecisionContext {
  canonical: McpOAuthCanonicalCredentials;
  canonicalRaw: string;
  hasLegacyClient: boolean;
  hasLegacyTokens: boolean;
  legacyClient: OAuthClientInformationMixed | undefined;
  legacyTokens: OAuthTokens | undefined;
  clientMatchesCanonical: boolean;
  tokensMatchCanonical: boolean;
}

type Decision = (context: DecisionContext) => CredentialPairSnapshot;

/** 状态码：版本 + 四个匹配位，决策表按它单次查表（不再嵌套判断）。 */
function decisionCode(context: DecisionContext, version: 1 | 2): string {
  const bits = [
    context.hasLegacyTokens ? "T" : "-",
    context.hasLegacyClient ? "C" : "-",
    context.tokensMatchCanonical ? "t" : "-",
    context.clientMatchesCanonical ? "c" : "-",
  ];
  return `v${version}:${bits.join("")}`;
}

/** 纯 legacy 视图：只有两个镜像文本，没有 canonical。 */
function legacyView(context: DecisionContext): CredentialPairSnapshot {
  return {
    clientInformation: context.legacyClient,
    source: "legacy",
    ...(context.legacyTokens ? { tokens: context.legacyTokens } : {}),
  };
}

function canonicalView(context: DecisionContext): CredentialPairSnapshot {
  return {
    ...canonicalFields(context.canonical, () => context.canonicalRaw),
    source: "canonical",
    tokens: context.canonical.tokens,
  };
}

/**
 * 版本 2 的决策表（键 = decisionCode 的状态码）：
 * v2:---- 无镜像令牌 → 仅返回 legacy 客户端信息；
 * v2:T-t- 令牌一致且客户端一致 → 用 canonical 快照；
 * v2:T-tc 令牌一致、客户端不一致 → 只回 legacy 令牌；
 * v2:TCtc 两者都与 canonical 一致 → 回 legacy 双方；
 * v2:T*-- 其余含 legacy 令牌的情况 → 只回 legacy 令牌与客户端信息。
 */
const V2_DECISIONS: Record<string, Decision> = {
  "v2:----": (context) => ({ clientInformation: context.legacyClient, source: "legacy" }),
  "v2:TCtc": (context) => ({
    clientInformation: context.legacyClient,
    source: "legacy",
    tokens: context.legacyTokens,
  }),
};

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
  const context: DecisionContext = {
    canonical: canonical ?? ({ tokens: {} as OAuthTokens } as McpOAuthCanonicalCredentials),
    canonicalRaw: input.canonicalRaw ?? "",
    clientMatchesCanonical: false,
    hasLegacyClient: legacyClient !== undefined,
    hasLegacyTokens: legacyTokens !== undefined,
    legacyClient,
    legacyTokens,
    tokensMatchCanonical: false,
  };

  if (!canonical || !input.canonicalRaw) {
    if (!legacyClient && !legacyTokens) return undefined;
    return legacyView(context);
  }

  context.canonical = canonical;
  context.canonicalRaw = input.canonicalRaw;
  context.clientMatchesCanonical = isDeepStrictEqual(legacyClient, canonical.client_information);
  context.tokensMatchCanonical = isDeepStrictEqual(legacyTokens, canonical.tokens);

  if (canonical.version === 1) {
    // 版本 1：只有「镜像令牌存在且客户端不冲突」才用镜像，否则用 canonical 快照。
    const usableMirror =
      legacyTokens !== undefined && (!legacyClient || context.clientMatchesCanonical);
    if (!usableMirror) return canonicalView(context);
    return {
      clientInformation: legacyClient ?? canonical.client_information,
      source: "legacy",
      tokens: legacyTokens,
    };
  }

  const decision = V2_DECISIONS[decisionCode(context, 2)];
  if (decision) return decision(context);
  if (context.hasLegacyTokens && context.tokensMatchCanonical) {
    if (context.hasLegacyClient) return canonicalView(context);
    return { source: "legacy", tokens: context.legacyTokens };
  }
  if (!context.hasLegacyTokens) return { clientInformation: legacyClient, source: "legacy" };
  if (context.hasLegacyClient && context.clientMatchesCanonical) {
    return { clientInformation: legacyClient, source: "legacy", tokens: legacyTokens };
  }
  return { clientInformation: legacyClient, source: "legacy" };
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
