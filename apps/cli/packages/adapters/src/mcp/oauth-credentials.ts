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

/**
 * 存储键与派生取值的规格表。
 *
 * 键名决定「写到凭据库的哪一格」；其余四项决定「新代际串多长」「旧记录派生时截多少字符」
 * 「提前多久算临近过期」「秒与毫秒的换算」。归到一处后，调用点只读名字，
 * 不必在文件里四处对照散落的常量声明。
 */
const STORE_SPEC = {
  clientSlot: "client_information",
  tokensSlot: "tokens",
  generationBytes: 16,
  legacyDigestChars: 32,
  expirySkewMs: 30_000,
  msPerSecond: 1_000,
} as const;

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
  (value) => {
    // 每个字段只读一次：类型判定与内层校验共用同一引用（代理记录读取顺序）。
    const information = value.client_information;
    return isRecord(information) && typeof information.client_id === "string";
  },
  (value) => {
    const held = value.tokens;
    return isRecord(held) && typeof held.access_token === "string";
  },
  (value) => {
    const held = value.tokens;
    return isRecord(held) && typeof held.token_type === "string";
  },
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
  return `legacy-${digest.slice(0, STORE_SPEC.legacyDigestChars)}`;
}

/** 可选字段映射：canonical 的落盘键 → 快照字段（缺席即不写入）。 */
const OPTIONAL_FIELD_MAP = [
  ["expires_at", "expiresAt"],
  ["issuer", "issuer"],
  ["obtained_at", "obtainedAt"],
] as const;

/**
 * 投影 canonical 快照字段。键顺序固定为字母序
 * （clientInformation → expiresAt → generation → issuer → obtainedAt → raw），
 * 调用方再补 source / tokens，读者按 Object.keys 也能拿到稳定形状。
 */
function canonicalFields(
  record: McpOAuthCanonicalCredentials,
  readText: () => string,
): Omit<CanonicalCredentialSnapshot, "tokens"> {
  const source = record as unknown as Record<string, unknown>;
  const snapshot: Record<string, unknown> = { clientInformation: record.client_information };
  if (source[OPTIONAL_FIELD_MAP[0][0]] !== undefined) {
    snapshot[OPTIONAL_FIELD_MAP[0][1]] = source[OPTIONAL_FIELD_MAP[0][0]];
  }
  snapshot.generation = generationFor(record, readText());
  for (const [from, to] of OPTIONAL_FIELD_MAP.slice(1)) {
    if (source[from] !== undefined) snapshot[to] = source[from];
  }
  snapshot.raw = readText();
  return snapshot as Omit<CanonicalCredentialSnapshot, "tokens">;
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
    expiresAt = obtainedAt + payload.tokens.expires_in * STORE_SPEC.msPerSecond;
  }
  const generation = randomBytes(STORE_SPEC.generationBytes).toString("hex");
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
    [mcpOAuthCredentialKey(keySpace, STORE_SPEC.clientSlot)]: legacyClientRaw,
    [mcpOAuthCredentialKey(keySpace, STORE_SPEC.tokensSlot)]: legacyTokensRaw,
  });
  return { canonical: record, generation, legacyClientRaw, legacyTokensRaw, raw: text };
}

export function isCanonicalTokenNearExpiry(
  view: Pick<CanonicalCredentialSnapshot, "expiresAt">,
  now = Date.now(),
  skewWindowMs = STORE_SPEC.expirySkewMs,
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
  const keyList = [canonicalKey, mcpOAuthCredentialKey(keySpace, STORE_SPEC.tokensSlot)];
  if (invalidateScope === "all")
    keyList.push(mcpOAuthCredentialKey(keySpace, STORE_SPEC.clientSlot));
  return await store.deleteManyIfValue(canonicalKey, expectedText, keyList);
}

/** canonical 版本 2 的决策上下文：一次算好全部匹配位，交给分支判定。 */
interface DecisionContext {
  record: McpOAuthCanonicalCredentials;
  canonicalRaw: string;
  mirrorClient: OAuthClientInformationMixed | undefined;
  mirrorTokens: OAuthTokens | undefined;
  clientMatchesCanonical: boolean;
  tokensMatchCanonical: boolean;
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
 * 版本 2（及未来更高版本）的镜像决策，按令牌 → 客户端两级判定：
 * 一、镜像令牌必须有真值才算「在用」；弱值（null/false/0/""）视为已作废，
 *     永远不复活——此时只回客户端镜像（含 undefined 的自有键）。
 * 二、令牌与 canonical 一致时：弱值/缺省客户端省略 clientInformation 自有键；
 *     真值且一致的客户端回 legacy 三元组；真值但不同的客户端回 canonical 对。
 * 三、令牌已变时只保留客户端镜像（含弱值原样透传），供重新授权使用。
 */
function decideVersion2Mirror(context: DecisionContext): CredentialPairSnapshot {
  const tokensUsable = Boolean(context.mirrorTokens);
  const clientUsable = Boolean(context.mirrorClient);
  if (!tokensUsable) return { clientInformation: context.mirrorClient, source: "legacy" };
  if (!context.tokensMatchCanonical) {
    // 令牌已变：仅当客户端仍是同一家（真值且与 canonical 一致）时采纳这次刷新。
    if (clientUsable && context.clientMatchesCanonical) {
      return {
        clientInformation: context.mirrorClient,
        source: "legacy",
        tokens: context.mirrorTokens,
      };
    }
    return { clientInformation: context.mirrorClient, source: "legacy" };
  }
  if (!clientUsable) return { source: "legacy", tokens: context.mirrorTokens };
  if (context.clientMatchesCanonical) {
    return {
      clientInformation: context.mirrorClient,
      source: "legacy",
      tokens: context.mirrorTokens,
    };
  }
  return canonicalView(context);
}

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

  return decideVersion2Mirror(context);
}
export async function loadCredentialPair(
  store: SharedKnorviaCredentialStore,
  keySpace: string,
): Promise<CredentialPairSnapshot | undefined> {
  const canonicalKey = mcpOAuthCredentialKey(keySpace, MCP_OAUTH_CANONICAL_CREDENTIALS_KEY);
  const clientKey = mcpOAuthCredentialKey(keySpace, STORE_SPEC.clientSlot);
  const tokensKey = mcpOAuthCredentialKey(keySpace, STORE_SPEC.tokensSlot);
  const view = await store.loadMany([canonicalKey, clientKey, tokensKey]);
  return deriveCredentialPair({
    canonicalRaw: view[canonicalKey] ?? undefined,
    legacyClientRaw: view[clientKey] ?? undefined,
    legacyTokensRaw: view[tokensKey] ?? undefined,
  });
}
