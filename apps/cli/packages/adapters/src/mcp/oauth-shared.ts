// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { OAuthDiscoveryState } from "@modelcontextprotocol/client";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isRecord, mcpOAuthCredentialKey } from "./oauth-credentials.js";

const DEFAULT_DISCOVERY_TTL_MS = 86_400_000;

export interface McpOAuthAuthorizationContext {
  authorizationUrl: string;
  redirectUrl: string;
  serverName: string;
}

function withoutFinalSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function saveDiscoveryRecord(
  store: SharedKnorviaCredentialStore,
  keyPrefix: string,
  state: OAuthDiscoveryState,
  now = Date.now(),
): Promise<void> {
  const stateKey = mcpOAuthCredentialKey(keyPrefix, "discovery_state");
  const fetchedAtKey = mcpOAuthCredentialKey(keyPrefix, "discovery_state_fetched_at");
  await store.saveMany({
    [stateKey]: JSON.stringify(state),
    [fetchedAtKey]: String(now),
  });
}

export async function loadDiscoveryRecord(
  store: SharedKnorviaCredentialStore,
  keyPrefix: string,
  options: { expectedIssuer?: string; now?: number; ttlMs?: number } = {},
): Promise<OAuthDiscoveryState | undefined> {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_DISCOVERY_TTL_MS;
  const stateKey = mcpOAuthCredentialKey(keyPrefix, "discovery_state");
  const fetchedAtKey = mcpOAuthCredentialKey(keyPrefix, "discovery_state_fetched_at");
  const snapshot = await store.loadMany([stateKey, fetchedAtKey]);
  const raw = snapshot[stateKey];
  if (!raw) return undefined;
  const fetchedAt = Number(snapshot[fetchedAtKey]);
  if (!Number.isFinite(fetchedAt) || now - fetchedAt >= ttlMs) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.authorizationServerUrl !== "string") return undefined;

  const expectedIssuer = options.expectedIssuer;
  if (expectedIssuer) {
    const metadata = parsed.authorizationServerMetadata as { issuer?: unknown } | null | undefined;
    const issuer = metadata?.issuer ?? parsed.authorizationServerUrl;
    // 仅在需要比较 issuer 时拒绝非字符串缓存，避免 TypeError；其余 SDK 元数据保持不透明。
    if (typeof issuer !== "string" || issuer === "") return undefined;
    if (withoutFinalSlash(issuer) !== withoutFinalSlash(expectedIssuer)) return undefined;
  }
  return parsed as unknown as OAuthDiscoveryState;
}
