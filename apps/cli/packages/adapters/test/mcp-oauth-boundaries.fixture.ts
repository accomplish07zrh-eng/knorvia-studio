// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const oauthUrls = {
  errors: new URL("../src/mcp/oauth-errors.ts", import.meta.url).href,
  shared: new URL("../src/mcp/oauth-shared.ts", import.meta.url).href,
  sdk: "@modelcontextprotocol/client",
};
export const errors = (await import(
  oauthUrls.errors
)) as typeof import("../src/mcp/oauth-errors.js");
export const shared = (await import(
  oauthUrls.shared
)) as typeof import("../src/mcp/oauth-shared.js");
export const sdk = (await import(oauthUrls.sdk)) as typeof import("@modelcontextprotocol/client");
