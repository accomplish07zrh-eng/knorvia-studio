// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { OAuthDiscoveryState } from "@modelcontextprotocol/client";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isRecord, mcpOAuthCredentialKey } from "./oauth-credentials.js";

const DEFAULT_DISCOVERY_TTL_MS = 86_400_000;

export type { McpOAuthAuthorizationContext } from "./oauth-shared-types.js";

import type { McpOAuthAuthorizationContext } from "./oauth-shared-types.js";

function withoutFinalSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

// 发现记录缓存约定：
// 一、state 与 fetched_at 同时写入，读取时两项都要存在，否则视为无缓存。
// 二、fetched_at 非有限数或已超过 maxAgeMs 即视为过期，按未命中处理。
// 三、解析失败、非对象、缺少 authorizationServerUrl 一律返回 undefined（缓存不可信）。
// 四、只有调用方要求校验 issuer 时才检查 issuer 字段，其余 SDK 元数据保持不透明。
// 五、issuer 比较前剥掉结尾斜杠，避免 https://a/ 与 https://a 被判成不同。
export async function saveDiscoveryRecord(
  credentials: SharedKnorviaCredentialStore,
  namespacePrefix: string,
  discovery: OAuthDiscoveryState,
  currentTime = Date.now(),
): Promise<void> {
  const stateKey = mcpOAuthCredentialKey(namespacePrefix, "discovery_state");
  const fetchedAtKey = mcpOAuthCredentialKey(namespacePrefix, "discovery_state_fetched_at");
  await credentials.saveMany({
    [stateKey]: JSON.stringify(discovery),
    [fetchedAtKey]: String(currentTime),
  });
}

/** 读取缓存快照：两项都在且有值时才返回，否则视为未命中。 */
function readCachedState(
  stored: Record<string, string | null | undefined>,
  stateKey: string,
  fetchedAtKey: string,
): { raw: string; storedAt: number } | undefined {
  const cachedRaw = stored[stateKey];
  const storedAt = Number(stored[fetchedAtKey]);
  if (!cachedRaw || !Number.isFinite(storedAt)) return undefined;
  return { raw: cachedRaw, storedAt };
}

/** 反序列化并校验缓存内容；只在调用方要求时比较 issuer。 */
function decodeCachedState(
  raw: string,
  expectedIssuer: string | undefined,
): OAuthDiscoveryState | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(decoded) || typeof decoded.authorizationServerUrl !== "string") return undefined;
  if (expectedIssuer) {
    const metadata = decoded.authorizationServerMetadata as { issuer?: unknown } | null | undefined;
    const issuer = metadata?.issuer ?? decoded.authorizationServerUrl;
    // 仅在需要比较 issuer 时拒绝非字符串缓存，避免 TypeError；其余 SDK 元数据保持不透明。
    if (typeof issuer !== "string" || issuer === "") return undefined;
    if (withoutFinalSlash(issuer) !== withoutFinalSlash(expectedIssuer)) return undefined;
  }
  return decoded as unknown as OAuthDiscoveryState;
}

export async function loadDiscoveryRecord(
  credentials: SharedKnorviaCredentialStore,
  namespacePrefix: string,
  settings: { expectedIssuer?: string; now?: number; ttlMs?: number } = {},
): Promise<OAuthDiscoveryState | undefined> {
  const currentTime = settings.now ?? Date.now();
  const maxAgeMs = settings.ttlMs ?? DEFAULT_DISCOVERY_TTL_MS;
  const stateKey = mcpOAuthCredentialKey(namespacePrefix, "discovery_state");
  const fetchedAtKey = mcpOAuthCredentialKey(namespacePrefix, "discovery_state_fetched_at");
  const stored = await credentials.loadMany([stateKey, fetchedAtKey]);
  const cached = readCachedState(stored, stateKey, fetchedAtKey);
  if (!cached) return undefined;
  if (currentTime - cached.storedAt >= maxAgeMs) return undefined;

  return decodeCachedState(cached.raw, settings.expectedIssuer);
}
