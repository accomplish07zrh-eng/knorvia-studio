// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 工具调用的执行层。一次 `call` 的流程：
//   等就绪 → （必要时）重连 → 单次尝试 → 失败按「授权 / 掉线」两条路恢复后重发。
//
// 观测契约（字段名逐字保留，事件名不带动态片段）：
//   `mcp.tool.call` 的基底字段 mcpServerName / mcpToolName / module / timeoutMs；
//   成功侧补 argumentKeys / contentBlocks / durationMs / hasStructuredContent / isError /
//   serverRequestId；失败侧补 error / errorName / status / timedOut，超时时再加 budgetExhausted。
//   `mcp.oauth.tool_call.authorization_required`、`mcp.server.reconnect.started`、
//   `mcp.server.reconnect.failed` 的事件名同样逐字保留。
//
// 一个容易改错的点：**每次重发都用「剩余预算」**，不重新计时。所以 deadline 与超时文案
// 要沿着调用链一路带下去（这里收进 CallScope），而不是每个阶段各自新建。

import type { Client } from "@modelcontextprotocol/client";
import type { McpCallToolOptions, McpCallToolRequest, McpToolCallResult } from "@knorvia/contracts";
import { authorizationCode } from "./client-auth.js";
import type { McpConnections } from "./client-connection.js";
import { toolRequestMetadata, toolResultValue } from "./client-context.js";
import { DEFAULT_CONNECTION_MS, type McpClientState, type ServerRecord } from "./client-state.js";
import { errorName, errorText } from "./client-stdio-log.js";
import { classifyInteractiveAuthorizationTrigger } from "./oauth-errors.js";
import {
  createMcpDeadline,
  remainingMcpDeadlineMs,
  waitWithinMcpDeadline,
  type McpDeadline,
} from "./timeout.js";

/** 判定「服务端返回的是超时」用的文案特征。 */
const TIMED_OUT_TEXT = /time(?:d)?\s*out|timeout/i;

/** 预算用掉超过这个比例才认为「预算耗尽」（区别于「提前取消」）。 */
const EXHAUSTED_FRACTION = 0.9;

/** SDK 在连接已断时给的原样文案。 */
const NOT_CONNECTED_MESSAGE = "Not connected";

/** 观测基底：四段固定字段，成功与失败两条路径共用。 */
type CallLogBase = {
  event: string;
  mcpServerName: string;
  mcpToolName: string;
  module: string;
  timeoutMs: number;
};

/**
 * 一次调用尝试的完整上下文。整条链（尝试 → 恢复 → 重发）共用同一个实例，
 * 这样「剩余预算」与「取消信号」不会在某个阶段被重新计算。
 */
interface CallScope {
  readonly request: McpCallToolRequest;
  readonly options: McpCallToolOptions;
  readonly deadline: McpDeadline;
  readonly timeoutMessage: string;
}

/** 判定一个错误是否属于「已超时」：文案特征，或名字是 AbortError。 */
function isTimeoutFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return TIMED_OUT_TEXT.test(errorText(error));
}

/** 造观测基底。 */
function callLogBase(request: McpCallToolRequest, timeoutMs: number): CallLogBase {
  const base = {} as CallLogBase;
  base.event = "mcp.tool.call";
  base.mcpServerName = request.serverName;
  base.mcpToolName = request.toolName;
  base.module = "adapters.mcp";
  base.timeoutMs = timeoutMs;
  return base;
}

/** 从当前记录里取一条「已连接」的记录；不满足就抛给定错误。 */
function requireConnected(
  state: McpClientState,
  name: string,
  fallbackError: unknown,
): ServerRecord {
  const record = state.records.get(name);
  const usable = record?.client !== undefined && record.status.status === "connected";
  if (!usable) throw fallbackError;
  return record as ServerRecord;
}

export class McpToolCalls {
  constructor(
    private readonly state: McpClientState,
    private readonly connections: McpConnections,
  ) {}

  /** 在截止时间内等待；到点即抛超时错误。 */
  #waitWithin<T>(promise: Promise<T>, scope: CallScope): Promise<T> {
    return waitWithinMcpDeadline(
      promise,
      scope.deadline,
      scope.timeoutMessage,
      scope.options.signal,
    );
  }

  async call(
    request: McpCallToolRequest,
    options: McpCallToolOptions = {},
  ): Promise<McpToolCallResult> {
    const initial = this.state.records.get(request.serverName);
    const budget = options.timeoutMs ?? initial?.config.timeoutMs ?? DEFAULT_CONNECTION_MS;
    const timeoutMessage = `MCP tool ${request.serverName}/${request.toolName} timed out after ${budget}ms`;
    const scope: CallScope = {
      request,
      options,
      deadline: createMcpDeadline(budget),
      timeoutMessage,
    };

    // 先等上一次连接的 pending（同一服务可能正在连）。
    if (initial?.pending !== undefined) await this.#waitWithin(initial.pending, scope);

    // 已断开的：先重连，再继续。
    const afterPending = this.state.records.get(request.serverName);
    if (afterPending?.status.status === "disconnected") {
      await this.#waitWithin(this.#reconnect(request.serverName, afterPending), scope);
    }

    const connected = requireConnected(
      this.state,
      request.serverName,
      // 文案与既有错误一致（含服务名），下游有按 message 判定的路径。
      new Error(`MCP server is not connected: ${request.serverName}`),
    );
    try {
      return await this.#attempt(connected, scope);
    } catch (error) {
      return this.#recoverAndResend(scope, connected, error);
    }
  }

  /** 失败恢复：先看是否要交互式授权，再看是否只是掉线；都不匹配就原样抛出。 */
  async #recoverAndResend(
    scope: CallScope,
    connected: ServerRecord,
    error: unknown,
  ): Promise<McpToolCallResult> {
    const trigger = classifyInteractiveAuthorizationTrigger(error);
    const wantsAuthorization = trigger !== undefined && connected.config.type !== "stdio";
    if (wantsAuthorization) {
      await this.#reauthorize(scope, connected, trigger, error);
      return this.#resend(scope, error);
    }

    const isLostConnection = error instanceof Error && error.message === NOT_CONNECTED_MESSAGE;
    if (!isLostConnection) throw error;

    try {
      await this.#waitWithin(this.#reconnect(scope.request.serverName, connected), scope);
    } catch (reconnectError) {
      // 重连失败不覆盖原错误，只记一条告警后按原路径抛出。
      this.state.logger?.warn("MCP server reconnect failed", {
        error: errorText(reconnectError),
        event: "mcp.server.reconnect.failed",
        mcpServerName: scope.request.serverName,
        status: "failed",
      });
      throw error;
    }
    return this.#resend(scope, error);
  }

  /** 交互式授权恢复：先记日志，再请连接层恢复授权。 */
  async #reauthorize(
    scope: CallScope,
    connected: ServerRecord,
    trigger: { reason: string },
    error: unknown,
  ): Promise<void> {
    if (!authorizationCode(connected.config)) throw error;
    this.state.logger?.warn("MCP tool call requires OAuth authorization", {
      event: "mcp.oauth.tool_call.authorization_required",
      mcpServerName: scope.request.serverName,
      oauthTriggerReason: trigger.reason,
      status: "started",
      toolName: scope.request.toolName,
    });
    const recovered = this.connections.recoverAuthorization(
      scope.request.serverName,
      connected,
      trigger as never,
      error,
    );
    const outcome = await this.#waitWithin(recovered, scope);
    if (outcome.status !== "connected") throw error;
  }

  /** 重连并记一条 started 日志。 */
  #reconnect(name: string, record: ServerRecord) {
    this.state.logger?.warn("MCP server reconnecting after lost connection", {
      event: "mcp.server.reconnect.started",
      mcpServerName: name,
      status: "started",
      transport: record.config.type,
    });
    return this.connections.connect(name, record.config);
  }

  /** 重发一次；若此刻仍未连接上，抛出最初那个错误。 */
  #resend(scope: CallScope, originalError: unknown): Promise<McpToolCallResult> {
    const record = requireConnected(this.state, scope.request.serverName, originalError);
    return this.#attempt(record, scope);
  }

  /** 单次尝试：成功与失败各记一条日志，失败时原样抛出。 */
  async #attempt(connected: ServerRecord, scope: CallScope): Promise<McpToolCallResult> {
    const { request } = scope;
    const timeoutMs = remainingMcpDeadlineMs(scope.deadline, scope.timeoutMessage);
    const argumentKeys = Object.keys(request.arguments ?? {}).sort();
    const base = callLogBase(request, timeoutMs);
    this.state.logger?.debug("MCP tool call started", { ...base, argumentKeys, status: "started" });

    const started = Date.now();
    try {
      const metadata = toolRequestMetadata(request);
      const callArguments: Record<string, unknown> = {
        name: request.toolName,
        arguments: request.arguments ?? {},
      };
      if (metadata) callArguments._meta = metadata;
      const result = await (connected.client as Client).callTool(callArguments as never, {
        signal: scope.options.signal,
        timeout: timeoutMs,
        resetTimeoutOnProgress: true,
      });

      const durationMs = Date.now() - started;
      const isError = typeof result.isError === "boolean" ? result.isError : false;
      const serverRequestId = this.state.consumeToolResponse(request.trace?.spanId);
      this.#logOutcome(base, result, {
        durationMs,
        hasStructuredContent: result.structuredContent !== undefined,
        isError,
        serverRequestId,
      });
      return toolResultValue(result, serverRequestId);
    } catch (error) {
      const durationMs = Date.now() - started;
      const timedOut = isTimeoutFailure(error);
      const serverRequestId = this.state.consumeToolResponse(request.trace?.spanId);
      this.state.logger?.warn("MCP tool call failed", {
        ...base,
        argumentKeys,
        durationMs,
        error: errorText(error),
        errorName: errorName(error),
        status: "failed",
        timedOut,
        ...(serverRequestId ? { serverRequestId } : {}),
        ...(timedOut ? { budgetExhausted: durationMs >= timeoutMs * EXHAUSTED_FRACTION } : {}),
      });
      throw error;
    }
  }

  /** 成功侧日志：正常完成走 debug，服务端报错走 warn。 */
  #logOutcome(
    base: CallLogBase,
    result: { content?: unknown },
    outcome: {
      durationMs: number;
      hasStructuredContent: boolean;
      isError: boolean;
      serverRequestId: string | undefined;
    },
  ): void {
    const fields: Record<string, unknown> = { ...base };
    fields.contentBlocks = Array.isArray(result.content) ? result.content.length : 0;
    fields.durationMs = outcome.durationMs;
    fields.hasStructuredContent = outcome.hasStructuredContent;
    fields.isError = outcome.isError;
    if (outcome.serverRequestId) fields.serverRequestId = outcome.serverRequestId;

    if (outcome.isError) {
      this.state.logger?.warn("MCP tool returned an error", { ...fields, status: "failed" });
      return;
    }
    this.state.logger?.debug("MCP tool call completed", { ...fields, status: "completed" });
  }
}
