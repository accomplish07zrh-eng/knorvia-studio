// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { SharedKnorviaCredentialStore } from "../src/auth/shared-credentials.js";

export const credentialUrls = {
  credentials: new URL("../src/mcp/oauth-credentials.ts", import.meta.url).href,
  namespace: new URL("../src/mcp/oauth.ts", import.meta.url).href,
};
export const credentials = (await import(
  credentialUrls.credentials
)) as typeof import("../src/mcp/oauth-credentials.js");
export const namespace = (await import(
  credentialUrls.namespace
)) as typeof import("../src/mcp/oauth.js");
export const client = { client_id: "owned-client", client_name: "Owned client" };
export const tokens = { access_token: "owned-access", token_type: "Bearer" };
export const canonical = (version = 2, extra: Record<string, unknown> = {}) => ({
  client_information: client,
  published_by: "owned-publisher",
  tokens,
  version,
  ...extra,
});
export function store(
  overrides: Partial<SharedKnorviaCredentialStore> = {},
): SharedKnorviaCredentialStore {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected store operation");
  };
  return {
    filePath: "owned-memory-store",
    delete: unexpected,
    deleteIfValue: unexpected,
    deleteIfValues: unexpected,
    deleteManyIfValue: unexpected,
    load: unexpected,
    loadMany: unexpected,
    save: unexpected,
    saveMany: unexpected,
    saveReplacing: unexpected,
    ...overrides,
  };
}
export type Publication = Parameters<typeof credentials.publishCanonicalCredentials>[2];
export type PairInput = Parameters<typeof credentials.deriveCredentialPair>[0];
