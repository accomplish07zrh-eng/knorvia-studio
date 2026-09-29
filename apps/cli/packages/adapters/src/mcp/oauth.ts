// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import type { McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { McpOAuthAuthorizationContext } from "./oauth-shared.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;
const NAMESPACE_DIGEST_LENGTH = 24;

export type { McpOAuthAuthorizationContext };

export interface McpOAuthRuntimeOptions {
  authorizationTimeoutMs?: number;
  credentialStore?: SharedKnorviaCredentialStore;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
}

export function createCredentialKeyPrefix(
  serverName: string,
  serverUrl: string,
  config: McpAuthorizationCodeOAuthConfig,
): string {
  const framing = [
    serverName,
    serverUrl,
    config.clientId ?? "",
    config.scope ?? "",
    config.redirectPath ?? "",
  ].join("\n");
  const digest = createHash("sha256").update(framing).digest("hex");
  return `mcp:oauth:${digest.slice(0, NAMESPACE_DIGEST_LENGTH)}`;
}
