// SPDX-License-Identifier: Apache-2.0
// Retained public compatibility declaration.

export declare const MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE = "MCP_OAUTH_CALLBACK_DENIED";

export interface McpOAuthCallbackDeniedError extends Error {
  code: typeof MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE;
  oauthError: string;
  oauthErrorDescription?: string;
}

export interface LocalhostOAuthCallback {
  code: string;
  url: string;
}

export interface LocalhostOAuthCallbackServer {
  callbackPath: string;
  callbackUrl: string;
  close(): Promise<void>;
  waitForCallback(): Promise<LocalhostOAuthCallback>;
}

export declare function createLocalhostOAuthCallbackServer(input: {
  callbackPath: string;
  state: string;
}): Promise<LocalhostOAuthCallbackServer>;
