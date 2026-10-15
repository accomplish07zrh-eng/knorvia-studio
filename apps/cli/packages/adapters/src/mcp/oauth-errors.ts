// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  InsufficientScopeError,
  SdkErrorCode,
  UnauthorizedError,
} from "@modelcontextprotocol/client";

// 错误分类约定：
// 一、临时失败与交互式要求用两个 Symbol 品牌区分，跨模块传递不依赖错误文本。
// 二、分类只沿 cause 链迭代（不递归），并用 WeakSet 防环：重访同一个对象即停止。
// 三、见到临时刷新失败品牌立即返回 undefined：临时失败不应触发交互式授权。
// 四、SDK 的 InsufficientScope/Unauthorized/ClientHttpAuthentication 依次映射到稳定 reason。
// 五、reason 取值与 code 字段是契约：新增取值需同步契约与消费方。
const INTERACTIVE_BRAND = Symbol.for("knorvia.mcp.oauth.interactiveAuthorizationRequired");
const TEMPORARY_BRAND = Symbol.for("knorvia.mcp.oauth.temporaryRefreshFailure");

export type {
  InteractiveAuthorizationTrigger,
  McpOAuthInteractiveRequiredReason,
} from "./oauth-error-types.js";
export type { CreateInteractiveAuthorizationErrorInput } from "./oauth-error-types.js";

import type {
  CreateInteractiveAuthorizationErrorInput,
  InteractiveAuthorizationTrigger,
  McpOAuthInteractiveRequiredReason,
} from "./oauth-error-types.js";

interface InteractiveError extends Error, InteractiveAuthorizationTrigger {
  code: "MCP_OAUTH_INTERACTIVE_REQUIRED";
}

interface TemporaryError extends Error {
  code: "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE";
}

function markedError(message: string, cause: unknown, marker: symbol): Error {
  const failure = cause === undefined ? new Error(message) : new Error(message, { cause });
  Object.defineProperty(failure, marker, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return failure;
}

function trigger(
  reason: McpOAuthInteractiveRequiredReason,
  requiredScope?: string,
  resourceMetadataUrl?: string,
): InteractiveAuthorizationTrigger {
  const triggerSpec: InteractiveAuthorizationTrigger = { reason };
  if (requiredScope) triggerSpec.requiredScope = requiredScope;
  if (resourceMetadataUrl) triggerSpec.resourceMetadataUrl = resourceMetadataUrl;
  return triggerSpec;
}

function isReference(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function hasBrand(value: unknown, marker: symbol): boolean {
  return isReference(value) && (value as Record<symbol, unknown>)[marker] === true;
}

export function createInteractiveAuthorizationRequiredError(
  input: CreateInteractiveAuthorizationErrorInput,
): InteractiveError {
  const failure = markedError(
    `MCP server ${input.serverName} requires interactive OAuth authorization (${input.reason})`,
    input.cause,
    INTERACTIVE_BRAND,
  ) as InteractiveError;
  failure.code = "MCP_OAUTH_INTERACTIVE_REQUIRED";
  return Object.assign(
    failure,
    trigger(input.reason, input.requiredScope, input.resourceMetadataUrl),
  );
}

export function createTemporaryRefreshFailureError(input: {
  cause?: unknown;
  serverName: string;
}): TemporaryError {
  const failure = markedError(
    `MCP server ${input.serverName} OAuth token refresh failed temporarily`,
    input.cause,
    TEMPORARY_BRAND,
  ) as TemporaryError;
  failure.code = "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE";
  return failure;
}

/** 品牌标记错误：交互式授权要求按标记还原触发信息。 */
function brandedTrigger(cursor: unknown): InteractiveAuthorizationTrigger | undefined {
  if (!hasBrand(cursor, INTERACTIVE_BRAND)) return undefined;
  const marked = cursor as InteractiveAuthorizationTrigger;
  return trigger(marked.reason, marked.requiredScope, marked.resourceMetadataUrl);
}

/** SDK 错误：作用域不足与未授权各自映射到稳定的 reason。 */
function sdkTrigger(cursor: unknown): InteractiveAuthorizationTrigger | undefined {
  if (cursor instanceof InsufficientScopeError) {
    const requiredScopes = cursor.requiredScope;
    const resourceMetadata = cursor.resourceMetadataUrl;
    return trigger(
      "insufficient_scope",
      requiredScopes,
      resourceMetadata ? String(resourceMetadata) : undefined,
    );
  }
  if (cursor instanceof UnauthorizedError) return { reason: "unauthorized" };
  if (
    typeof cursor === "object" &&
    (cursor as { code?: unknown }).code === SdkErrorCode.ClientHttpAuthentication
  ) {
    return { reason: "unauthorized" };
  }
  return undefined;
}

export function classifyInteractiveAuthorizationTrigger(
  failure: unknown,
): InteractiveAuthorizationTrigger | undefined {
  const seen = new WeakSet<object>();
  let cursor = failure;
  while (cursor !== null && cursor !== undefined) {
    // 循环曾导致栈溢出；仅在本次调用跟踪对象/函数，重访前结束，长链用迭代处理。
    if (isReference(cursor)) {
      if (seen.has(cursor)) return undefined;
      seen.add(cursor);
    }
    // 临时失败品牌最先：它必须在读取交互标记与 SDK 字段之前短路。
    if (hasBrand(cursor, TEMPORARY_BRAND)) return undefined;
    const fromBrand = brandedTrigger(cursor);
    if (fromBrand !== undefined) return fromBrand;
    const fromSdk = sdkTrigger(cursor);
    if (fromSdk !== undefined) return fromSdk;
    const cause = (cursor as { cause?: unknown }).cause;
    if (cause === undefined || cause === cursor) return undefined;
    cursor = cause;
  }
  return undefined;
}
