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
  httpStatus: number; // 服务端返回的 HTTP 状态码。
  rpcMethod?: string; // JSON-RPC 方法名（能从正文解析出来时才有）。
  rpcToolName?: string; // JSON-RPC 工具名（能从正文解析出来时才有）。
  serverRequestId?: string; // 服务端请求 id（响应头带回来时才有）。
  spanId?: string; // 本次请求的 span id。
  traceId?: string; // 本次请求的 trace id。
}

interface /* 创建鉴权 fetch 的入参 */ CreateOfficialMcpAuthFetchInput {
  authHeadersPort?: OfficialMcpAuthHeadersPort; // 鉴权头端口；缺席时不做官方鉴权。
  baseFetch: typeof globalThis.fetch; // 底层 fetch（注入以便测试与代理）。
  logger?: Logger;
  onAuthFailure?: (kind: OfficialMcpAuthFailureKind) => void;
  onServerResponse?: (response: OfficialMcpServerResponseInfo) => void; // 服务端响应观察回调。
  official: McpOfficialProvenance;
  serverName: string; // 服务端名字，用于鉴权与可信来源判定。
  trustedOrigins: OfficialMcpTrustedOriginRegistry; // 可信来源登记表。
  url: string; // 目标请求地址。
  workspaceIdentity?: string;
  workspacePath?: string; // 工作区路径（鉴权头端口可能需要）。
}

interface RpcSummary {
  id?: string | number;
  method?: /* JSON-RPC 方法名（可从正文解析时才有） */ string;
  spanId?: string; // 本次请求的 span id。
  toolName?: /* JSON-RPC 工具名（可从正文解析时才有） */ string;
  traceId?: string; // 本次请求的 trace id。
}

/** 可选 RPC 字段表：仅保留有值的字段；键名与上游逐字一致（契约面）。 */
function optionalRpcFields(
  rpc: { method?: string; toolName?: string; spanId?: string; traceId?: string },
  failureKind: string | undefined,
  serverRequestId: string | undefined,
): Record<string, string> {
  return Object.fromEntries(
    [
      ["failureKind", failureKind],
      ["serverRequestId", serverRequestId],
      ["rpcMethod", rpc.method],
      ["rpcToolName", rpc.toolName],
      ["spanId", rpc.spanId],
      ["traceId", rpc.traceId],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function requestOrigin(value: string): string | undefined {
  try /* 解析可能失败，失败由 catch 给出降级值 */ {
    const url = new URL(value);
    return url.username || url.password ? undefined : url.origin;
  } catch /* 输入非法：按降级语义返回 */ {
    return /* 无法解析/无值 */ undefined;
  }
}

function requestPath(value: string): string {
  try /* 解析可能失败，失败由 catch 给出降级值 */ {
    return new URL(value).pathname;
  } catch /* 输入非法：按降级语义返回 */ {
    return /* 占位文本：与上游逐字一致 */ "(unparsable)";
  }
}

function objectFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeRpc(body: unknown): RpcSummary {
  if (typeof body !== "string" || !body) return {};
  try /* 解析可能失败，失败由 catch 给出降级值 */ {
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
    return /* 摘要视图 */ {
      ...(id !== undefined ? { id } : {}),
      ...(method ? /* 方法名：仅在有值时展开 */ { method } : {}),
      ...(spanId ? /* span：仅在有值时展开 */ { spanId } : {}),
      ...(toolName ? /* 工具名：仅在有值时展开 */ { toolName } : {}),
      ...(traceId ? /* trace：仅在有值时展开 */ { traceId } : {}),
    };
  } catch /* 输入非法：按降级语义返回 */ {
    return /* 摘要为空：正文非 JSON */ {};
  }
}

function requestBodyBytes(body: unknown): number | undefined {
  if (typeof body === "string") return Buffer.byteLength(body, "utf8");
  return body instanceof Uint8Array ? body.byteLength : undefined;
}

function mergeHeaders(
  incoming: /* 调用方原始头 */ HeadersInit | undefined,
  authHeaders: Record<string, string>,
): /* 合并后的头 */ Headers {
  const merged = /* 合并结果：就地累积 */ new Headers();
  const dynamicNames = new Set(Object.keys(authHeaders).map((name) => name.toLowerCase()));
  new Headers(incoming ?? {}).forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (dynamicNames.has(normalized)) return;
    if (
      isOfficialMcpReservedHeaderName(normalized) &&
      normalized !== "mcp-session-id" &&
      normalized !== "mcp-protocol-version"
    )
      return /* 该头已存在，保留先到者 */;
    merged.set(name, value);
  });
  for (const [name, value] of Object.entries(authHeaders)) merged.set(name, value);
  merged.delete("x-request-id");
  merged.delete("x-trace-id");
  return /* 合并完成 */ merged;
}

function timeoutHint(signal: AbortSignal | null | undefined): string {
  if (!signal) return "none";
  return signal.aborted ? "already-aborted" : "armed";
}

export function /* 入口：包装 fetch 并注入鉴权头 */ createOfficialMcpAuthFetch(
  input: CreateOfficialMcpAuthFetchInput,
): /* 与全局 fetch 同形 */ typeof globalThis.fetch {
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
    if (
      /* 来源校验：必须与期望来源完全一致 */ !origin ||
      !expectedOrigin ||
      origin !== expectedOrigin
    ) {
      throw failure(
        /* 拒绝原因：来源不可信 */ "official_mcp_origin_untrusted",
        `official MCP request origin does not match the configured endpoint: ${input.serverName}`,
      );
    }
    const trust = await input.trustedOrigins.isTrusted({
      mcpKey: input.official.mcpKey,
      /* 实际来源 */ origin,
      pluginId: input.official.pluginId,
    });
    if (/* 可信来源校验：非可信来源一律拒绝 */ !trust.trusted) {
      throw failure(
        /* 拒绝原因：来源不可信 */ "official_mcp_origin_untrusted",
        `official MCP origin is not trusted (${trust.detail ?? "unknown"}): ${input.serverName} origin=${origin} pluginId=${input.official.pluginId}`,
      );
    }

    const rpc = summarizeRpc(init?.body);
    const logBase = /* 日志公共字段：一次算好复用 */ {
      event: "mcp.official_auth.request",
      mcpKey: input.official.mcpKey,
      mcpServerName: input.serverName,
      module: "adapters.mcp.official_auth",
      requestBodyBytes: requestBodyBytes(init?.body),
      urlPath: requestPath(requestUrl),
      ...(rpc.method ? /* 上报方法名：键名 rpcMethod 为契约面 */ { rpcMethod: rpc.method } : {}),
      ...(rpc.id !== undefined ? { rpcId: rpc.id } : {}),
      ...(rpc.toolName
        ? /* 上报工具名：键名 rpcToolName 为契约面 */ { rpcToolName: rpc.toolName }
        : {}),
      ...(rpc.traceId ? /* 契约键 mcpTraceId 为对外名 */ { mcpTraceId: rpc.traceId } : {}),
    };

    async function send(attempt: number): Promise<{ response: Response; authApplied: boolean }> {
      let authHeaders: Record<string, string> = {};
      let resolveDurationMs: /* 解析耗时：失败路径保持 undefined */ number | undefined;
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
        if (/* 解析成功：带上鉴权头 */ resolved.ok) {
          authHeaders = /* 已解析出的鉴权头 */ resolved.headers;
        } else /* 失败分支：按原因走匿名回退 */ {
          input.logger?.warn("Official MCP auth headers unavailable for request", {
            /* 公共字段 */ ...logBase,
            /* 第几次尝试 */ attempt,
            event: "mcp.official_auth.resolve",
            fallback: /* 回退模式：匿名 */ "anonymous",
            reason: /* 解析器给出的具体原因 */ resolved.reason,
            /* 解析耗时 */ resolveDurationMs,
            status: "failed",
          });
        }
      } else /* 失败分支：按原因走匿名回退 */ {
        input.logger?.warn("Official MCP auth port unavailable for request", {
          /* 公共字段 */ ...logBase,
          /* 第几次尝试 */ attempt,
          event: "mcp.official_auth.resolve",
          fallback: /* 回退模式：匿名 */ "anonymous",
          reason: /* 固定原因：鉴权不可用 */ "official_auth_unavailable",
          status: "failed",
        });
      }
      const identity =
        /* 身份头摘要：随日志上报 */ summarizeOfficialMcpIdentityHeaders(authHeaders);
      const headers = mergeHeaders(init?.headers, authHeaders);
      input.logger?.debug("Official MCP request sending", {
        /* 公共字段 */ ...logBase,
        /* 第几次尝试 */ attempt,
        /* 解析耗时 */ resolveDurationMs,
        status: "started",
        timeoutHint: timeoutHint(init?.signal),
        /* 身份头摘要字段 */ ...identity,
      });
      const sendStartedAt = Date.now();
      // 凭据解析和准备错误不属于发送失败；只在此处开始网络/响应处理的 catch。
      try /* 解析可能失败，失败由 catch 给出降级值 */ {
        const response = await input.baseFetch(resource, { ...init, headers, redirect: "manual" });
        const serverRequestId = responseRequestId(response);
        const failureKind =
          /* tools/call 视为正常，其余按响应分类 */
          rpc.method === "tools/call" ? undefined : await classifyResponse(response);
        if (/* 有服务端标识或失败分类才上报 */ serverRequestId || failureKind) {
          input.onServerResponse?.({
            httpStatus: response.status,
            ...optionalRpcFields(rpc, failureKind, serverRequestId),
          });
        }
        const outcome = /* 归一化调用结果 */ {
          /* 公共字段 */ ...logBase,
          /* 第几次尝试 */ attempt,
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
        } else /* 失败分支：按原因走匿名回退 */ {
          input.logger?.warn("Official MCP response failed", { ...outcome, status: "failed" });
        }
        return { response, authApplied: Object.keys(authHeaders).length > 0 };
      } catch (error) {
        const sendDurationMs = Date.now() - sendStartedAt;
        input.logger?.warn("Official MCP request did not complete", {
          /* 公共字段 */ ...logBase,
          aborted:
            error instanceof Error &&
            (error.name === "AbortError" || error.name === "TimeoutError"),
          /* 第几次尝试 */ attempt,
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
        /* 公共字段 */ ...logBase,
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
