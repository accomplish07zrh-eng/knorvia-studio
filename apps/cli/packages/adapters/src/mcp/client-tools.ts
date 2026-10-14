// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

const TIMED_OUT_TEXT = /time(?:d)?\s*out|timeout/i;
const EXHAUSTED_FRACTION = 0.9;

export class McpToolCalls {
  constructor(
    private readonly state: McpClientState,
    private readonly connections: McpConnections,
  ) {}

  async call(
    request: McpCallToolRequest,
    options: McpCallToolOptions = {},
  ): Promise<McpToolCallResult> {
    const initial = this.state.records.get(request.serverName);
    const budget = options.timeoutMs ?? initial?.config.timeoutMs ?? DEFAULT_CONNECTION_MS;
    const deadline = createMcpDeadline(budget);
    const timeoutMessage = `MCP tool ${request.serverName}/${request.toolName} timed out after ${budget}ms`;
    const wait = <T>(promise: Promise<T>) =>
      waitWithinMcpDeadline(promise, deadline, timeoutMessage, options.signal);
    if (initial?.pending) await wait(initial.pending);
    const before = this.state.records.get(request.serverName);
    if (before?.status.status === "disconnected")
      await wait(this.reconnect(request.serverName, before));
    const connected = this.state.records.get(request.serverName);
    if (!connected?.client || connected.status.status !== "connected") {
      throw new Error(`MCP server is not connected: ${request.serverName}`);
    }
    try /* 调用可能失败，失败交由下方 catch 归类（授权/重连） */ {
      return await this.attempt(
        connected.client,
        request,
        remainingMcpDeadlineMs(deadline, timeoutMessage), // 单次调用只使用剩余预算，不重新计时。
        options.signal,
      );
    } catch (error) {
      const trigger = classifyInteractiveAuthorizationTrigger(error);
      if (trigger && connected.config.type !== "stdio") {
        if (!authorizationCode(connected.config)) throw error;
        this.state.logger?.warn("MCP tool call requires OAuth authorization", {
          event: "mcp.oauth.tool_call.authorization_required",
          mcpServerName: request.serverName,
          oauthTriggerReason: trigger.reason,
          status: "started",
          toolName: request.toolName,
        });
        const outcome = await wait(
          this.connections.recoverAuthorization(request.serverName, connected, trigger, error),
        );
        if (outcome.status !== "connected") throw error;
        return this.resend(request, options, deadline, timeoutMessage, error);
      }
      if (!(error instanceof Error) || error.message !== "Not connected") throw error;
      try /* 重连等待可能失败，失败不覆盖原错误 */ {
        await wait(this.reconnect(request.serverName, connected));
      } catch (reconnectError) /* 仅记录告警，保持原错误路径 */ {
        // 重连失败不覆盖原错误，继续按原路径处理。
        this.state.logger?.warn("MCP server reconnect failed", {
          error: errorText(reconnectError),
          event: "mcp.server.reconnect.failed",
          mcpServerName: request.serverName,
          status: "failed",
        });
        throw error;
      }
      return this.resend(request, options, deadline, timeoutMessage, error);
    }
  }

  private reconnect(name: string, record: ServerRecord) {
    this.state.logger?.warn("MCP server reconnecting after lost connection", {
      event: "mcp.server.reconnect.started",
      mcpServerName: name,
      status: "started",
      transport: record.config.type,
    });
    return this.connections.connect(name, record.config);
  }

  private resend(
    request: McpCallToolRequest,
    options: McpCallToolOptions,
    deadline: McpDeadline,
    timeoutMessage: string,
    originalError: unknown,
  ): Promise<McpToolCallResult> {
    const record = this.state.records.get(request.serverName);
    if (!record?.client || record.status.status !== "connected") throw originalError;
    return this.attempt(
      record.client,
      request,
      remainingMcpDeadlineMs(deadline, timeoutMessage),
      options.signal,
    );
  }

  private async attempt(
    client: Client,
    request: McpCallToolRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const argumentKeys = Object.keys(request.arguments ?? {}).sort();
    const base = {
      event: "mcp.tool.call",
      mcpServerName: request.serverName,
      mcpToolName: request.toolName,
      module: "adapters.mcp",
      timeoutMs,
    };
    this.state.logger?.debug("MCP tool call started", { ...base, argumentKeys, status: "started" });
    const started = Date.now();
    try /* 单次调用可能失败，失败交由上层归类 */ {
      const metadata = toolRequestMetadata(request);
      const result = await client.callTool(
        // 真正发起一次工具调用。
        {
          name: request.toolName,
          arguments: request.arguments ?? {},
          ...(metadata ? { _meta: metadata } : {}),
        },
        { signal, timeout: timeoutMs, resetTimeoutOnProgress: true },
      );
      const durationMs = Date.now() - started;
      const isError = typeof result.isError === "boolean" ? result.isError : false; // 只有明确为布尔时才当作失败。
      const serverRequestId = this.state.consumeToolResponse(request.trace?.spanId);
      const outcome = /* 归一化后的调用结果视图 */ {
        // 观测结果对象：字段形状由本模块定义。
        ...base,
        contentBlocks: Array.isArray(result.content) ? result.content.length : 0,
        durationMs, // 本次调用耗时（毫秒）。
        hasStructuredContent: result.structuredContent !== undefined, // 是否有结构化内容，供上层决定渲染方式。
        isError, // 本次调用是否失败。
        ...(serverRequestId ? { serverRequestId } : {}), // 有服务端请求 id 时才带上。
      };
      if (isError)
        this.state.logger?.warn("MCP tool returned an error", { ...outcome, status: "failed" });
      else this.state.logger?.debug("MCP tool call completed", { ...outcome, status: "completed" });
      return toolResultValue(result, serverRequestId);
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = errorText(error);
      const timedOut = // 超时判定：由截止时间与超时文案决定。
        TIMED_OUT_TEXT.test(message) || (error instanceof Error && error.name === "AbortError");
      const serverRequestId = this.state.consumeToolResponse(request.trace?.spanId);
      this.state.logger?.warn("MCP tool call failed", {
        ...base,
        argumentKeys, // 参数键（不含值），仅用于观测。
        /* 本次调用耗时 */ durationMs,
        error: message,
        ...(serverRequestId ? { serverRequestId } : {}),
        errorName: errorName(error),
        status: "failed",
        timedOut, // 本次调用是否超时。
        ...(timedOut ? { budgetExhausted: durationMs >= timeoutMs * EXHAUSTED_FRACTION } : {}),
      });
      throw error;
    }
  }
}
