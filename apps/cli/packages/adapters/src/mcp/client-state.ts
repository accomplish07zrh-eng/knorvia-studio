// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 客户端的状态容器。这里只存「连接代号、服务记录、失败诊断、工具响应 id 缓存」四类东西，
// 本身不做并发保护 —— 调用方在同一事件循环内串行访问（见门面与生命周期模块）。
//
// 语义约定（字段与方法名被多处读取，不可改）：
// 一、generations 是连接代号：每次 advance 递增，异步回调据此判断自己是否已过期；
// 二、records 保存每个服务的配置、状态、工具与当前 client/transport，重连时整体替换；
// 三、diagnostics 记录最近一次失败诊断，成功路径不清它，由上层在读的时候取走；
// 四、responseIdCache 只留最近 64 条工具响应 id，超出按插入顺序淘汰最旧；
// 五、consumeToolResponse 是「读后即删」，同一 spanId 只能取到一次。

import { randomUUID } from "node:crypto";
import type { Client } from "@modelcontextprotocol/client";
import type {
  Logger,
  McpServerConfig,
  McpServerStatus,
  McpServerStatusKind,
  McpToolDescriptor,
  OfficialMcpAuthHeadersPort,
  OfficialMcpTrustedOriginRegistry,
} from "@knorvia/contracts";
import type { McpServerFailureKind, OfficialMcpAuthFailureKind } from "@knorvia/shared";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { NetworkEgressEnvPolicy } from "./network.js";
import type { McpOAuthRuntimeOptions } from "./oauth.js";
import type { OfficialMcpServerResponseInfo } from "./official-auth.js";
import type { McpConnectionContext } from "./pool.js";
import type { McpTelemetryTracker } from "./telemetry.js";
import type {
  ConnectionDiagnostic,
  CreateMcpAdapterOptions,
  ProtocolTransport,
  ServerRecord,
} from "./client-state-types.js";

export type {
  ConnectionDiagnostic,
  CreateMcpAdapterOptions,
  ProtocolTransport,
  ServerRecord,
} from "./client-state-types.js";

/** 工具响应 id 的缓存上限。 */
const MAX_TOOL_RESPONSE_IDS = 64;

/** 默认连接超时与心跳间隔（毫秒）。 */
export const DEFAULT_CONNECTION_MS = 30_000;
export const DEFAULT_PING_MS = 5_000;

/** 只有 tools/call 的响应需要被追踪。 */
const TOOL_CALL_METHOD = "tools/call";

/** 默认客户端标识。 */
const DEFAULT_CLIENT_NAME = "knorvia";
const DEFAULT_CLIENT_VERSION = "0.0.0";

/** 组装一份服务状态快照：status 与 transport 必填，其余按 extras 透传。 */
export function statusValue(
  config: McpServerConfig,
  status: McpServerStatusKind,
  extras: Partial<McpServerStatus> = {},
): McpServerStatus {
  const snapshot = {} as McpServerStatus;
  snapshot.status = status;
  snapshot.transport = config.type;
  snapshot.toolCount = extras.toolCount ?? 0;
  snapshot.updatedAt = new Date().toISOString();
  snapshot.authorization = extras.authorization;
  snapshot.error = extras.error;
  snapshot.failureKind = extras.failureKind;
  snapshot.protocolEra = extras.protocolEra;
  snapshot.serverRequestId = extras.serverRequestId;
  return snapshot;
}

export class McpClientState {
  readonly id: string;
  readonly clientName: string;
  readonly clientVersion: string;
  readonly context: McpConnectionContext | undefined;
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly logger: Logger | undefined;
  readonly oauth: McpOAuthRuntimeOptions | undefined;
  readonly network: NetworkEgressEnvPolicy | undefined;
  readonly official: CreateMcpAdapterOptions["officialMcpAuth"];
  readonly telemetry: McpTelemetryTracker | undefined;
  readonly workingDirectory: string | undefined;
  readonly generations = new Map<string, number>();
  readonly records = new Map<string, ServerRecord>();
  readonly diagnostics = new Map<string, ConnectionDiagnostic>();
  readonly authFailures = new Map<string, OfficialMcpAuthFailureKind>();
  /** 工具响应 id 缓存：读后即删，且有容量上限。 */
  private readonly responseIdCache = new Map<string, string>();
  /** 凭据库：由门面在启动后注入，供 OAuth 刷新使用。 */
  credentialStore: SharedKnorviaCredentialStore | undefined;

  constructor(options: CreateMcpAdapterOptions) {
    this.id = randomUUID();
    this.clientName = options.clientName ?? DEFAULT_CLIENT_NAME;
    this.clientVersion = options.clientVersion ?? DEFAULT_CLIENT_VERSION;
    this.context = options.connectionContext;
    this.env = options.env;
    this.logger = options.logger?.child({ ...this.context, module: "adapters.mcp" });
    this.oauth = options.mcpOAuth;
    this.network = options.network;
    this.official = options.officialMcpAuth;
    this.telemetry = options.telemetry;
    this.workingDirectory = options.workingDirectory;
  }

  /** 推进连接代号并返回新值；每推进一次，旧代号下的异步回调就视为过期。 */
  advance(name: string): number {
    const next = (this.generations.get(name) ?? 0) + 1;
    this.generations.set(name, next);
    return next;
  }

  /** 该代号是否仍是当前代号。 */
  current(name: string, generation: number): boolean {
    return this.generations.get(name) === generation;
  }

  /** 取某个服务的当前状态；没有记录时用调用方给的兜底值。 */
  snapshot(name: string, fallback: McpServerStatus): McpServerStatus {
    const record = this.records.get(name);
    return record === undefined ? fallback : record.status;
  }

  /** 只记失败诊断（不参与响应 id 缓存）。 */
  private rememberFailure(name: string, info: OfficialMcpServerResponseInfo): void {
    if (!info.failureKind) return;
    const diagnostic = {} as ConnectionDiagnostic;
    diagnostic.failureKind = info.failureKind;
    if (info.serverRequestId) diagnostic.serverRequestId = info.serverRequestId;
    this.diagnostics.set(name, diagnostic);
  }

  /** 工具响应 id 入缓存；超出上限时淘汰最早插入的一条。 */
  private rememberResponseId(spanId: string, serverRequestId: string): void {
    this.responseIdCache.set(spanId, serverRequestId);
    if (this.responseIdCache.size <= MAX_TOOL_RESPONSE_IDS) return;
    const oldest = this.responseIdCache.keys().next();
    if (!oldest.done) this.responseIdCache.delete(oldest.value);
  }

  /**
   * 观察一次服务响应。过期代号的回调直接忽略；不满足追踪条件时只记失败诊断。
   * 追踪条件：有 spanId、方法是 tools/call、且该服务不在 connecting 状态。
   */
  observeResponse(name: string, generation: number, info: OfficialMcpServerResponseInfo): void {
    if (!this.current(name, generation)) return;

    const record = this.records.get(name);
    const connecting = record?.status.status === "connecting";
    const trackable = Boolean(info.spanId) && info.rpcMethod === TOOL_CALL_METHOD && !connecting;
    if (!trackable) {
      this.rememberFailure(name, info);
      return;
    }
    if (!info.serverRequestId) return;
    this.rememberResponseId(info.spanId as string, info.serverRequestId);
  }

  /** 取走某个 spanId 的响应 id；取过即删，同一 spanId 只能取到一次。 */
  consumeToolResponse(spanId: string | undefined): string | undefined {
    if (!spanId) return undefined;
    const response = this.responseIdCache.get(spanId);
    this.responseIdCache.delete(spanId);
    return response;
  }
}
