// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

// 命名与读取细节：
// 一、键名格式 `<keySpace>:<name>`：keySpace 由调用方给出，name 取本文件的三个常量之一。
// 二、loadMany 的三键顺序固定为 canonical / client / tokens，缺键以 undefined 进入派生。
// 三、派生视图的 source 字段用于排障：canonical 表示主记录可用，legacy 表示只能用镜像。
// 四、保存与删除都作用于同一组键，保证新旧读者看到一致的凭据集合。
// 五、非法 JSON 一律按「不存在」处理（parseRaw 返回 undefined），不抛错。
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

export function mcpOAuthCredentialKey(keySpace: string, name: string): string {
  return `${keySpace}:${name}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 字段规格表：每项一个断言，新增字段只需加一行（顺序无关）。 */
const CANONICAL_FIELD_CHECKS: readonly ((value: Record<string, unknown>) => boolean)[] = [
  (value) =>
    typeof value.version === "number" && MCP_OAUTH_SUPPORTED_CREDENTIAL_VERSIONS.has(value.version),
  (value) => typeof value.published_by === "string" && value.published_by.length > 0,
  (value) => isRecord(value.client_information),
  (value) => isRecord(value.tokens),
  (value) =>
    isRecord(value.client_information) && typeof value.client_information.client_id === "string",
  (value) => isRecord(value.tokens) && typeof value.tokens.access_token === "string",
  (value) => isRecord(value.tokens) && typeof value.tokens.token_type === "string",
];

export function isCanonicalCredentials(value: unknown): value is McpOAuthCanonicalCredentials {
  return isRecord(value) && CANONICAL_FIELD_CHECKS.every((assertion) => assertion(value));
}

function parseRaw(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function generationFor(record: McpOAuthCanonicalCredentials, text: string): string {
  if (typeof record.generation === "string" && record.generation.length > 0) {
    return record.generation;
  }
  const digest = createHash("sha256").update(text).digest("hex");
  return `legacy-${digest.slice(0, LEGACY_DIGEST_LENGTH)}`;
}

/** 可选字段映射：canonical 的落盘键 → 快照字段（缺席即不写入）。 */
const OPTIONAL_FIELD_MAP = [
  ["expires_at", "expiresAt"],
  ["issuer", "issuer"],
  ["obtained_at", "obtainedAt"],
] as const;

/** 投影可选字段：按表遍历，值为 undefined 的键不出现。 */
function optionalFields(record: McpOAuthCanonicalCredentials): Record<string, unknown> {
  const source = record as unknown as Record<string, unknown>;
  const present: Record<string, unknown> = {};
  for (const [from, to] of OPTIONAL_FIELD_MAP) {
    if (source[from] !== undefined) present[to] = source[from];
  }
  return present;
}

function canonicalFields(
  record: McpOAuthCanonicalCredentials,
  readText: () => string,
): Omit<CanonicalCredentialSnapshot, "tokens"> {
  return {
    clientInformation: record.client_information,
    generation: generationFor(record, readText()),
    raw: readText(),
    ...optionalFields(record),
  } as Omit<CanonicalCredentialSnapshot, "tokens">;
}

export async function loadCanonicalCredentials(
  store: SharedKnorviaCredentialStore,
  keySpace: string,
): Promise<CanonicalCredentialSnapshot | undefined> {
  const text = await store.load(
    mcpOAuthCredentialKey(keySpace, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY),
  );
  if (!text) return undefined;
  const record = parseRaw(text);
  if (!isCanonicalCredentials(record)) return undefined;
  return { ...canonicalFields(record, () => text), tokens: record.tokens };
}

export async function publishCanonicalCredentials(
  store: SharedKnorviaCredentialStore,
  keySpace: string,
  payload: PublishCanonicalCredentialsInput,
): Promise<PublishedCanonicalCredentials> {
  const obtainedAt = payload.obtainedAt ?? Date.now();
  let expiresAt: number | undefined;
  if (typeof payload.tokens.expires_in === "number" && Number.isFinite(payload.tokens.expires_in)) {
    expiresAt = obtainedAt + payload.tokens.expires_in * MILLISECONDS_PER_SECOND;
  }
  const generation = randomBytes(GENERATION_BYTES).toString("hex");
  const record: McpOAuthCanonicalCredentials = {
    client_information: payload.clientInformation,
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    generation,
    ...(payload.issuer !== undefined ? { issuer: payload.issuer } : {}),
    obtained_at: obtainedAt,
    published_by: payload.publishedBy,
    tokens: payload.tokens,
    version: MCP_OAUTH_CREDENTIALS_VERSION,
  };
  // 三次序列化先完成，保留各次输入读取及 toJSON 的失败顺序，不补造缺失文本。
  const text = JSON.stringify(record);
  const legacyClientRaw = JSON.stringify(payload.clientInformation);
  const legacyTokensRaw = JSON.stringify(payload.tokens);
  await store.saveMany({
    [mcpOAuthCredentialKey(keySpace, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY)]: text,
    [mcpOAuthCredentialKey(keySpace, CLIENT_KEY)]: legacyClientRaw,
    [mcpOAuthCredentialKey(keySpace, TOKENS_KEY)]: legacyTokensRaw,
  });
  return { canonical: record, generation, legacyClientRaw, legacyTokensRaw, raw: text };
}

export function isCanonicalTokenNearExpiry(
  view: Pick<CanonicalCredentialSnapshot, "expiresAt">,
  now = Date.now(),
  skewWindowMs = EXPIRY_SKEW_MS,
): boolean {
  return view.expiresAt === undefined || now >= view.expiresAt - skewWindowMs;
}

export async function invalidateCanonicalCredentials(
  store: SharedKnorviaCredentialStore,
  keySpace: string,
  expectedText: string,
  invalidateScope: CanonicalInvalidationScope,
): Promise<boolean> {
  const canonicalKey = mcpOAuthCredentialKey(keySpace, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY);
  const keyList = [canonicalKey, mcpOAuthCredentialKey(keySpace, TOKENS_KEY)];
  if (invalidateScope === "all") keyList.push(mcpOAuthCredentialKey(keySpace, CLIENT_KEY));
  return await store.deleteManyIfValue(canonicalKey, expectedText, keyList);
}

/** canonical 版本 2 的决策上下文：一次算好全部匹配位，交给决策表。 */
interface DecisionContext {
  record: McpOAuthCanonicalCredentials;
  canonicalRaw: string;
  hasLegacyClient: boolean;
  hasLegacyTokens: boolean;
  mirrorClient: OAuthClientInformationMixed | undefined;
  mirrorTokens: OAuthTokens | undefined;
  clientMatchesCanonical: boolean;
  tokensMatchCanonical: boolean;
}

type Decision = (context: DecisionContext) => CredentialPairSnapshot;

/** 状态码：版本 + 四个匹配位，决策表按它单次查表（不再嵌套判断）。 */
function decisionCode(context: DecisionContext, version: 1 | 2): string {
  const flags = [
    context.hasLegacyTokens ? "T" : "-",
    context.hasLegacyClient ? "C" : "-",
    context.tokensMatchCanonical ? "t" : "-",
    context.clientMatchesCanonical ? "c" : "-",
  ];
  return `v${version}:${flags.join("")}`;
}

/** 纯 legacy 视图：只有两个镜像文本，没有 canonical。 */
function legacyView(context: DecisionContext): CredentialPairSnapshot {
  return {
    clientInformation: context.mirrorClient,
    source: "legacy",
    ...(context.mirrorTokens ? { tokens: context.mirrorTokens } : {}),
  };
}

function canonicalView(context: DecisionContext): CredentialPairSnapshot {
  return {
    ...canonicalFields(context.record, () => context.canonicalRaw),
    source: "canonical",
    tokens: context.record.tokens,
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
  "v2:----": (context) => ({ clientInformation: context.mirrorClient, source: "legacy" }),
  "v2:TCtc": (context) => ({
    clientInformation: context.mirrorClient,
    source: "legacy",
    tokens: context.mirrorTokens,
  }),
};

export function deriveCredentialPair(payload: {
  canonicalRaw?: string;
  legacyClientRaw?: string;
  legacyTokensRaw?: string;
}): CredentialPairSnapshot | undefined {
  const parsedCanonical = parseRaw(payload.canonicalRaw);
  const record =
    parsedCanonical !== undefined && isCanonicalCredentials(parsedCanonical)
      ? parsedCanonical
      : undefined;
  // 旧镜像的 JSON 弱值是既有协议；类型断言不增加运行时校验或净化。
  const mirrorClient = parseRaw(payload.legacyClientRaw) as OAuthClientInformationMixed | undefined;
  const mirrorTokens = parseRaw(payload.legacyTokensRaw) as OAuthTokens | undefined;
  const context: DecisionContext = {
    record: record ?? ({ tokens: {} as OAuthTokens } as McpOAuthCanonicalCredentials),
    canonicalRaw: payload.canonicalRaw ?? "",
    clientMatchesCanonical: false,
    hasLegacyClient: mirrorClient !== undefined,
    hasLegacyTokens: mirrorTokens !== undefined,
    mirrorClient,
    mirrorTokens,
    tokensMatchCanonical: false,
  };

  if (!record || !payload.canonicalRaw) {
    if (!mirrorClient && !mirrorTokens) return undefined;
    return legacyView(context);
  }

  context.record = record;
  context.canonicalRaw = payload.canonicalRaw;
  context.clientMatchesCanonical = isDeepStrictEqual(mirrorClient, record.client_information);
  context.tokensMatchCanonical = isDeepStrictEqual(mirrorTokens, record.tokens);

  if (record.version === 1) {
    // 版本 1：只有「镜像令牌存在且客户端不冲突」才用镜像，否则用 canonical 快照。
    const usableMirror =
      mirrorTokens !== undefined && (!mirrorClient || context.clientMatchesCanonical);
    if (!usableMirror) return canonicalView(context);
    return {
      clientInformation: mirrorClient ?? record.client_information,
      source: "legacy",
      tokens: mirrorTokens,
    };
  }

  const decision = V2_DECISIONS[decisionCode(context, 2)];
  if (decision) return decision(context);
  if (context.hasLegacyTokens && context.tokensMatchCanonical) {
    if (context.hasLegacyClient) return canonicalView(context);
    return { source: "legacy", tokens: context.mirrorTokens };
  }
  if (!context.hasLegacyTokens) return { clientInformation: mirrorClient, source: "legacy" };
  if (context.hasLegacyClient && context.clientMatchesCanonical) {
    return { clientInformation: mirrorClient, source: "legacy", tokens: mirrorTokens };
  }
  return { clientInformation: mirrorClient, source: "legacy" };
}
export async function loadCredentialPair(
  store: SharedKnorviaCredentialStore,
  keySpace: string,
): Promise<CredentialPairSnapshot | undefined> {
  const canonicalKey = mcpOAuthCredentialKey(keySpace, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY);
  const clientKey = mcpOAuthCredentialKey(keySpace, CLIENT_KEY);
  const tokensKey = mcpOAuthCredentialKey(keySpace, TOKENS_KEY);
  const view = await store.loadMany([canonicalKey, clientKey, tokensKey]);
  return deriveCredentialPair({
    canonicalRaw: view[canonicalKey] ?? undefined,
    legacyClientRaw: view[clientKey] ?? undefined,
    legacyTokensRaw: view[tokensKey] ?? undefined,
  });
}
