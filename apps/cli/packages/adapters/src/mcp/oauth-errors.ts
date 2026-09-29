// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  InsufficientScopeError,
  SdkErrorCode,
  UnauthorizedError,
} from "@modelcontextprotocol/client";

const INTERACTIVE_BRAND = Symbol.for("knorvia.mcp.oauth.interactiveAuthorizationRequired");
const TEMPORARY_BRAND = Symbol.for("knorvia.mcp.oauth.temporaryRefreshFailure");

export type McpOAuthInteractiveRequiredReason =
  | "no_credentials"
  | "no_refresh_token"
  | "invalid_grant"
  | "invalid_client"
  | "insufficient_scope"
  | "unauthorized"
  | "legacy_provider_seam";

export interface InteractiveAuthorizationTrigger {
  reason: McpOAuthInteractiveRequiredReason;
  requiredScope?: string;
  resourceMetadataUrl?: string;
}

interface InteractiveError extends Error, InteractiveAuthorizationTrigger {
  code: "MCP_OAUTH_INTERACTIVE_REQUIRED";
}

interface TemporaryError extends Error {
  code: "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE";
}

function markedError(message: string, cause: unknown, brand: symbol): Error {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  Object.defineProperty(error, brand, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return error;
}

function trigger(
  reason: McpOAuthInteractiveRequiredReason,
  requiredScope?: string,
  resourceMetadataUrl?: string,
): InteractiveAuthorizationTrigger {
  const result: InteractiveAuthorizationTrigger = { reason };
  if (requiredScope) result.requiredScope = requiredScope;
  if (resourceMetadataUrl) result.resourceMetadataUrl = resourceMetadataUrl;
  return result;
}

function isReference(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function hasBrand(value: unknown, brand: symbol): boolean {
  return isReference(value) && (value as Record<symbol, unknown>)[brand] === true;
}

export function createInteractiveAuthorizationRequiredError(input: {
  cause?: unknown;
  reason: McpOAuthInteractiveRequiredReason;
  requiredScope?: string;
  resourceMetadataUrl?: string;
  serverName: string;
}): InteractiveError {
  const error = markedError(
    `MCP server ${input.serverName} requires interactive OAuth authorization (${input.reason})`,
    input.cause,
    INTERACTIVE_BRAND,
  ) as InteractiveError;
  error.code = "MCP_OAUTH_INTERACTIVE_REQUIRED";
  return Object.assign(
    error,
    trigger(input.reason, input.requiredScope, input.resourceMetadataUrl),
  );
}

export function createTemporaryRefreshFailureError(input: {
  cause?: unknown;
  serverName: string;
}): TemporaryError {
  const error = markedError(
    `MCP server ${input.serverName} OAuth token refresh failed temporarily`,
    input.cause,
    TEMPORARY_BRAND,
  ) as TemporaryError;
  error.code = "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE";
  return error;
}

export function classifyInteractiveAuthorizationTrigger(
  error: unknown,
): InteractiveAuthorizationTrigger | undefined {
  const visited = new WeakSet<object>();
  let current = error;
  while (current !== null && current !== undefined) {
    // 循环曾导致栈溢出；仅在本次调用跟踪对象/函数，重访前结束，长链用迭代处理。
    if (isReference(current)) {
      if (visited.has(current)) return undefined;
      visited.add(current);
    }
    if (hasBrand(current, TEMPORARY_BRAND)) return undefined;
    if (hasBrand(current, INTERACTIVE_BRAND)) {
      const branded = current as InteractiveAuthorizationTrigger;
      return trigger(branded.reason, branded.requiredScope, branded.resourceMetadataUrl);
    }
    if (current instanceof InsufficientScopeError) {
      const scope = current.requiredScope;
      const metadata = current.resourceMetadataUrl;
      return trigger("insufficient_scope", scope, metadata ? String(metadata) : undefined);
    }
    if (current instanceof UnauthorizedError) return { reason: "unauthorized" };
    if (
      typeof current === "object" &&
      (current as { code?: unknown }).code === SdkErrorCode.ClientHttpAuthentication
    ) {
      return { reason: "unauthorized" };
    }
    const cause = (current as { cause?: unknown }).cause;
    if (cause === undefined || cause === current) return undefined;
    current = cause;
  }
  return undefined;
}
