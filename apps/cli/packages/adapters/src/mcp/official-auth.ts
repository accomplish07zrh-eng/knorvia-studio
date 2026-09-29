// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import type {
  Logger,
  McpOfficialProvenance,
  OfficialMcpAuthHeadersPort,
  OfficialMcpTrustedOriginRegistry,
} from "@knorvia/contracts";
import {
  isOfficialMcpReservedHeaderName,
  summarizeOfficialMcpIdentityHeaders,
  type McpServerFailureKind,
  type OfficialMcpAuthFailureKind,
} from "@knorvia/shared";
import {
  classifyResponse,
  discardResponse,
  numericHeader,
  responseRequestId,
} from "./official-auth-response.js";

export { findOfficialMcpReservedHeaders } from "@knorvia/shared";

export class OfficialMcpAuthError extends Error {
  readonly kind: OfficialMcpAuthFailureKind;

  constructor(kind: OfficialMcpAuthFailureKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "OfficialMcpAuthError";
  }
}

export interface OfficialMcpServerResponseInfo {
  failureKind?: McpServerFailureKind;
  httpStatus: number;
  rpcMethod?: string;
  rpcToolName?: string;
  serverRequestId?: string;
  spanId?: string;
  traceId?: string;
}

interface CreateOfficialMcpAuthFetchInput {
  authHeadersPort?: OfficialMcpAuthHeadersPort;
  baseFetch: typeof globalThis.fetch;
  logger?: Logger;
  onAuthFailure?: (kind: OfficialMcpAuthFailureKind) => void;
  onServerResponse?: (response: OfficialMcpServerResponseInfo) => void;
  official: McpOfficialProvenance;
  serverName: string;
  trustedOrigins: OfficialMcpTrustedOriginRegistry;
  url: string;
  workspaceIdentity?: string;
  workspacePath?: string;
}

interface RpcSummary {
  id?: string | number;
  method?: string;
  spanId?: string;
  toolName?: string;
  traceId?: string;
}

function requestOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.username || url.password ? undefined : url.origin;
  } catch {
    return undefined;
  }
}

function requestPath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "(unparsable)";
  }
}

function objectFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeRpc(body: unknown): RpcSummary {
  if (typeof body !== "string" || !body) return {};
  try {
    const payload: unknown = JSON.parse(body);
    if (!objectFields(payload)) return {};
    const params = objectFields(payload.params) ? payload.params : undefined;
    const meta = objectFields(params?._meta) ? params._meta : undefined;
    const id =
      typeof payload.id === "number" || typeof payload.id === "string" ? payload.id : undefined;
    const method = typeof payload.method === "string" ? payload.method : undefined;
    const spanId = typeof meta?.span_id === "string" ? meta.span_id : undefined;
    const toolName = typeof params?.name === "string" ? params.name : undefined;
    const traceId = typeof meta?.trace_id === "string" ? meta.trace_id : undefined;
    return {
      ...(id !== undefined ? { id } : {}),
      ...(method ? { method } : {}),
      ...(spanId ? { spanId } : {}),
      ...(toolName ? { toolName } : {}),
      ...(traceId ? { traceId } : {}),
    };
  } catch {
    return {};
  }
}

function requestBodyBytes(body: unknown): number | undefined {
  if (typeof body === "string") return Buffer.byteLength(body, "utf8");
  return body instanceof Uint8Array ? body.byteLength : undefined;
}

function mergeHeaders(
  incoming: HeadersInit | undefined,
  authHeaders: Record<string, string>,
): Headers {
  const merged = new Headers();
  const dynamicNames = new Set(Object.keys(authHeaders).map((name) => name.toLowerCase()));
  new Headers(incoming ?? {}).forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (dynamicNames.has(normalized)) return;
    if (
      isOfficialMcpReservedHeaderName(normalized) &&
      normalized !== "mcp-session-id" &&
      normalized !== "mcp-protocol-version"
    )
      return;
    merged.set(name, value);
  });
  for (const [name, value] of Object.entries(authHeaders)) merged.set(name, value);
  merged.delete("x-request-id");
  merged.delete("x-trace-id");
  return merged;
}

function timeoutHint(signal: AbortSignal | null | undefined): string {
  if (!signal) return "none";
  return signal.aborted ? "already-aborted" : "armed";
}

export function createOfficialMcpAuthFetch(
  input: CreateOfficialMcpAuthFetchInput,
): typeof globalThis.fetch {
  const expectedOrigin = requestOrigin(input.url);

  function failure(kind: OfficialMcpAuthFailureKind, message: string): OfficialMcpAuthError {
    input.onAuthFailure?.(kind);
    return new OfficialMcpAuthError(kind, message);
  }

  return async (resource, init) => {
    const requestUrl =
      typeof resource === "string"
        ? resource
        : resource instanceof URL
          ? resource.toString()
          : resource.url;
    const origin = requestOrigin(requestUrl);
    if (!origin || !expectedOrigin || origin !== expectedOrigin) {
      throw failure(
        "official_mcp_origin_untrusted",
        `official MCP request origin does not match the configured endpoint: ${input.serverName}`,
      );
    }
    const trust = await input.trustedOrigins.isTrusted({
      mcpKey: input.official.mcpKey,
      origin,
      pluginId: input.official.pluginId,
    });
    if (!trust.trusted) {
      throw failure(
        "official_mcp_origin_untrusted",
        `official MCP origin is not trusted (${trust.detail ?? "unknown"}): ${input.serverName} origin=${origin} pluginId=${input.official.pluginId}`,
      );
    }

    const rpc = summarizeRpc(init?.body);
    const logBase = {
      event: "mcp.official_auth.request",
      mcpKey: input.official.mcpKey,
      mcpServerName: input.serverName,
      module: "adapters.mcp.official_auth",
      requestBodyBytes: requestBodyBytes(init?.body),
      urlPath: requestPath(requestUrl),
      ...(rpc.method ? { rpcMethod: rpc.method } : {}),
      ...(rpc.id !== undefined ? { rpcId: rpc.id } : {}),
      ...(rpc.toolName ? { rpcToolName: rpc.toolName } : {}),
      ...(rpc.traceId ? { mcpTraceId: rpc.traceId } : {}),
    };

    async function send(attempt: number): Promise<{ response: Response; authApplied: boolean }> {
      let authHeaders: Record<string, string> = {};
      let resolveDurationMs: number | undefined;
      if (input.authHeadersPort) {
        const startedAt = Date.now();
        const resolved = await input.authHeadersPort.resolveHeaders({
          mcpKey: input.official.mcpKey,
          pluginId: input.official.pluginId,
          targetOrigin: origin as string,
          ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
          ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
          ...(init?.signal ? { signal: init.signal } : {}),
        });
        resolveDurationMs = Date.now() - startedAt;
        if (resolved.ok) {
          authHeaders = resolved.headers;
        } else {
          input.logger?.warn("Official MCP auth headers unavailable for request", {
            ...logBase,
            attempt,
            event: "mcp.official_auth.resolve",
            fallback: "anonymous",
            reason: resolved.reason,
            resolveDurationMs,
            status: "failed",
          });
        }
      } else {
        input.logger?.warn("Official MCP auth port unavailable for request", {
          ...logBase,
          attempt,
          event: "mcp.official_auth.resolve",
          fallback: "anonymous",
          reason: "official_auth_unavailable",
          status: "failed",
        });
      }
      const identity = summarizeOfficialMcpIdentityHeaders(authHeaders);
      const headers = mergeHeaders(init?.headers, authHeaders);
      input.logger?.debug("Official MCP request sending", {
        ...logBase,
        attempt,
        resolveDurationMs,
        status: "started",
        timeoutHint: timeoutHint(init?.signal),
        ...identity,
      });
      const sendStartedAt = Date.now();
      // 凭据解析和准备错误不属于发送失败；只在此处开始网络/响应处理的 catch。
      try {
        const response = await input.baseFetch(resource, { ...init, headers, redirect: "manual" });
        const serverRequestId = responseRequestId(response);
        const failureKind =
          rpc.method === "tools/call" ? undefined : await classifyResponse(response);
        if (serverRequestId || failureKind) {
          input.onServerResponse?.({
            httpStatus: response.status,
            ...(failureKind ? { failureKind } : {}),
            ...(serverRequestId ? { serverRequestId } : {}),
            ...(rpc.method ? { rpcMethod: rpc.method } : {}),
            ...(rpc.toolName ? { rpcToolName: rpc.toolName } : {}),
            ...(rpc.spanId ? { spanId: rpc.spanId } : {}),
            ...(rpc.traceId ? { traceId: rpc.traceId } : {}),
          });
        }
        const outcome = {
          ...logBase,
          attempt,
          httpStatus: response.status,
          responseBodyBytes: numericHeader(response.headers.get("content-length")),
          sendDurationMs: Date.now() - sendStartedAt,
          ...(serverRequestId ? { serverRequestId } : {}),
        };
        if (response.ok) {
          input.logger?.debug("Official MCP response received", {
            ...outcome,
            status: "completed",
          });
        } else {
          input.logger?.warn("Official MCP response failed", { ...outcome, status: "failed" });
        }
        return { response, authApplied: Object.keys(authHeaders).length > 0 };
      } catch (error) {
        const sendDurationMs = Date.now() - sendStartedAt;
        input.logger?.warn("Official MCP request did not complete", {
          ...logBase,
          aborted:
            error instanceof Error &&
            (error.name === "AbortError" || error.name === "TimeoutError"),
          attempt,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : "unknown",
          sendDurationMs,
          status: "failed",
        });
        throw error;
      }
    }

    let result = await send(1);
    if (result.response.status === 401 && result.authApplied) {
      input.logger?.info("Official MCP retrying once after 401", {
        ...logBase,
        attempt: 2,
        status: "started",
      });
      await discardResponse(result.response);
      result = await send(2);
    }
    const response = result.response;
    let rejected: { kind: OfficialMcpAuthFailureKind; message: string } | undefined;
    if (response.status === 401) {
      rejected = {
        kind: "official_auth_rejected",
        message: "official MCP rejected the current credential",
      };
    } else if (response.status === 403) {
      rejected = {
        kind: "official_auth_forbidden",
        message: "official MCP denied access for the current plan",
      };
    } else if (response.status >= 300 && response.status < 400) {
      rejected = {
        kind: "official_auth_redirect_blocked",
        message: `official MCP responded with a blocked redirect (${response.status})`,
      };
    }
    if (rejected) {
      const requestId = rpc.method === "tools/call" ? responseRequestId(response) : undefined;
      const message = requestId ? `${rejected.message} - ${requestId}` : rejected.message;
      await discardResponse(response);
      throw failure(rejected.kind, message);
    }
    return response;
  };
}
