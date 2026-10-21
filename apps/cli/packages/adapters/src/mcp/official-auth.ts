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

/** 一次服务端响应里与「RPC 语义」有关的三项（都能从正文解析出来时才有）。 */
type ResponseRpcPart = {
  rpcMethod?: string;
  rpcToolName?: string;
  failureKind?: McpServerFailureKind;
};

/** 一次服务端响应里与「链路追踪」有关的三项。 */
type ResponseTracePart = { spanId?: string; traceId?: string; serverRequestId?: string };

/** 观测到的一次服务端响应：HTTP 状态码 + 上面两段。 */
export type OfficialMcpServerResponseInfo = { httpStatus: number } & ResponseRpcPart &
  ResponseTracePart;

/** 鉴权 fetch 入参里与「凭据解析」有关的三项。 */
type AuthFetchCredentialPart = {
  authHeadersPort?: OfficialMcpAuthHeadersPort;
  official: McpOfficialProvenance;
  trustedOrigins: OfficialMcpTrustedOriginRegistry;
};

/** 鉴权 fetch 入参里与「请求目标」有关的三项。 */
type AuthFetchTargetPart = { baseFetch: typeof globalThis.fetch; url: string; serverName: string };

/** 鉴权 fetch 入参里与「可观测 / 工作区」有关的五项。 */
type AuthFetchObserverPart = {
  logger?: Logger;
  onAuthFailure?: (kind: OfficialMcpAuthFailureKind) => void;
  onServerResponse?: (response: OfficialMcpServerResponseInfo) => void;
  workspaceIdentity?: string;
  workspacePath?: string;
};

/** 创建鉴权 fetch 的入参：由上面三段合成。 */
type CreateOfficialMcpAuthFetchInput = AuthFetchCredentialPart &
  AuthFetchTargetPart &
  AuthFetchObserverPart;

/** 从 JSON-RPC 正文里抽出的摘要：标识 + RPC 名 + 追踪 id。 */
type RpcSummary = { id?: string | number } & {
  method?: string;
  toolName?: string;
  spanId?: string;
  traceId?: string;
};

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

/**
 * 把「有值才出现的字段」拼进目标对象。
 *
 * 判定口径是 **truthy**（`if (!value) continue`），这与原实现的
 * `...(cond ? { k: cond } : {})` 完全一致：空串、`undefined`、`0`、`null`
 * 都不会被写入。**不要改成 `!== undefined`** —— 那会让空串字段出现在请求参数与日志里，
 * 破坏「缺席即不适用」的观测约定（`mcp-official-auth-request` 有断言守这条）。
 */
function withPresent(
  target: Record<string, unknown>,
  entries: readonly (readonly [string, unknown])[],
): Record<string, unknown> {
  for (const [key, value] of entries) {
    if (!value) continue;
    target[key] = value;
  }
  return target;
}

/** 拼一条鉴权相关日志：基底 + 本次增量 + 有值才出现的补充字段。 */
function authLog(
  base: Record<string, unknown>,
  delta: Record<string, unknown>,
  extra?: readonly (readonly [string, unknown])[],
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  Object.assign(fields, base);
  Object.assign(fields, delta);
  if (extra !== undefined) withPresent(fields, extra);
  return fields;
}

/** 从 JSON-RPC 正文里抽摘要；正文非字符串或非 JSON 时返回空摘要。 */
function summarizeRpc(body: unknown): RpcSummary {
  if (typeof body !== "string" || !body) return {};
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    // 输入非法：按降级语义返回空摘要。
    return {};
  }
  if (!objectFields(payload)) return {};

  const params = objectFields(payload.params) ? payload.params : undefined;
  const meta = objectFields(params?._meta) ? params._meta : undefined;
  const summary = {} as RpcSummary;
  if (typeof payload.id === "number" || typeof payload.id === "string") summary.id = payload.id;
  if (typeof payload.method === "string") summary.method = payload.method;
  if (typeof meta?.span_id === "string") summary.spanId = meta.span_id;
  if (typeof params?.name === "string") summary.toolName = params.name;
  if (typeof meta?.trace_id === "string") summary.traceId = meta.trace_id;
  return summary;
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
    // 日志公共字段：一次算好，整条请求复用。
    const logBase: Record<string, unknown> = {
      event: "mcp.official_auth.request",
      mcpKey: input.official.mcpKey,
      mcpServerName: input.serverName,
      module: "adapters.mcp.official_auth",
      requestBodyBytes: requestBodyBytes(init?.body),
      urlPath: requestPath(requestUrl),
    };
    // 键名 rpcMethod / rpcId / rpcToolName / mcpTraceId 都是观测契约，**插入顺序也要保持**
    // （日志字段顺序有断言守）。原顺序：method → id → toolName → traceId。
    if (rpc.method) logBase.rpcMethod = rpc.method;
    if (rpc.id !== undefined) logBase.rpcId = rpc.id;
    if (rpc.toolName) logBase.rpcToolName = rpc.toolName;
    if (rpc.traceId) logBase.mcpTraceId = rpc.traceId;

    async function send(attempt: number): Promise<{ response: Response; authApplied: boolean }> {
      let authHeaders: Record<string, string> = {};
      let resolveDurationMs: number | undefined;

      if (input.authHeadersPort) {
        const startedAt = Date.now();
        const ask: Record<string, unknown> = {
          mcpKey: input.official.mcpKey,
          pluginId: input.official.pluginId,
          targetOrigin: origin as string,
        };
        withPresent(ask, [
          ["workspaceIdentity", input.workspaceIdentity],
          ["workspacePath", input.workspacePath],
          ["signal", init?.signal],
        ]);
        const resolved = await input.authHeadersPort.resolveHeaders(
          ask as Parameters<typeof input.authHeadersPort.resolveHeaders>[0],
        );
        resolveDurationMs = Date.now() - startedAt;
        if (resolved.ok) {
          authHeaders = resolved.headers;
          // 成功时不记日志，保持既有「只在失败时报 warn」的观测口径。
        } else {
          input.logger?.warn(
            "Official MCP auth headers unavailable for request",
            authLog(logBase, {
              attempt,
              event: "mcp.official_auth.resolve",
              fallback: "anonymous",
              reason: resolved.reason,
              resolveDurationMs,
              status: "failed",
            }),
          );
        }
      } else {
        // 端口缺席：固定原因 official_auth_unavailable，不带 resolveDurationMs。
        input.logger?.warn(
          "Official MCP auth port unavailable for request",
          authLog(logBase, {
            attempt,
            event: "mcp.official_auth.resolve",
            fallback: "anonymous",
            reason: "official_auth_unavailable",
            status: "failed",
          }),
        );
      }

      const identity = summarizeOfficialMcpIdentityHeaders(authHeaders);
      const headers = mergeHeaders(init?.headers, authHeaders);
      input.logger?.debug(
        "Official MCP request sending",
        authLog(
          logBase,
          {
            attempt,
            resolveDurationMs,
            status: "started",
            timeoutHint: timeoutHint(init?.signal),
          },
          Object.entries(identity),
        ),
      );
      const sendStartedAt = Date.now();
      // 凭据解析和准备错误不属于发送失败；只在此处开始网络/响应处理的 try。
      try {
        const response = await input.baseFetch(resource, { ...init, headers, redirect: "manual" });
        const serverRequestId = responseRequestId(response);
        // tools/call 的失败由工具层归类，这里不再分类。
        const needsClassify = rpc.method !== "tools/call";
        const failureKind = needsClassify ? await classifyResponse(response) : undefined;

        if (serverRequestId || failureKind) {
          const info: Record<string, unknown> = { httpStatus: response.status };
          Object.assign(info, optionalRpcFields(rpc, failureKind, serverRequestId));
          input.onServerResponse?.(
            info as unknown as Parameters<NonNullable<typeof input.onServerResponse>>[0],
          );
        }

        const outcome: Record<string, unknown> = {};
        Object.assign(outcome, logBase);
        outcome.attempt = attempt;
        outcome.httpStatus = response.status;
        outcome.responseBodyBytes = numericHeader(response.headers.get("content-length"));
        outcome.sendDurationMs = Date.now() - sendStartedAt;
        withPresent(outcome, [["serverRequestId", serverRequestId]]);

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
        const aborted =
          error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
        input.logger?.warn(
          "Official MCP request did not complete",
          authLog(logBase, {
            aborted,
            attempt,
            error: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : "unknown",
            sendDurationMs,
            status: "failed",
          }),
        );
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
