// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

export type {
  ConnectionDiagnostic,
  CreateMcpAdapterOptions,
  ProtocolTransport,
  ServerRecord,
} from "./client-state-types.js";

import type {
  ConnectionDiagnostic,
  CreateMcpAdapterOptions,
  ProtocolTransport,
  ServerRecord,
} from "./client-state-types.js";

const MAX_TOOL_RESPONSE_IDS = 64;
export const DEFAULT_CONNECTION_MS = 30_000;
export const DEFAULT_PING_MS = 5_000;

export function statusValue(
  config: McpServerConfig,
  status: McpServerStatusKind,
  extras: Partial<McpServerStatus> = {},
): McpServerStatus {
  return {
    status,
    transport: config.type,
    toolCount: extras.toolCount ?? 0,
    updatedAt: new Date().toISOString(),
    authorization: extras.authorization,
    error: extras.error,
    failureKind: extras.failureKind,
    protocolEra: extras.protocolEra,
    serverRequestId: extras.serverRequestId,
  };
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
  private readonly responseIdCache = new Map<string, string>();
  readonly authFailures = new Map<string, OfficialMcpAuthFailureKind>();
  credentialStore: SharedKnorviaCredentialStore | undefined;

  constructor(options: CreateMcpAdapterOptions) {
    this.id = randomUUID();
    this.clientName = options.clientName ?? "knorvia";
    this.clientVersion = options.clientVersion ?? "0.0.0";
    this.context = options.connectionContext;
    this.env = options.env;
    this.logger = options.logger?.child({ ...this.context, module: "adapters.mcp" });
    this.oauth = options.mcpOAuth;
    this.network = options.network;
    this.official = options.officialMcpAuth;
    this.telemetry = options.telemetry;
    this.workingDirectory = options.workingDirectory;
  }

  advance(name: string): number {
    const generation = (this.generations.get(name) ?? 0) + 1;
    this.generations.set(name, generation);
    return generation;
  }

  current(name: string, generation: number): boolean {
    return this.generations.get(name) === generation;
  }

  snapshot(name: string, fallback: McpServerStatus): McpServerStatus {
    return this.records.get(name)?.status ?? fallback;
  }

  observeResponse(name: string, generation: number, info: OfficialMcpServerResponseInfo): void {
    if (!this.current(name, generation)) return;
    if (
      !info.spanId ||
      info.rpcMethod !== "tools/call" ||
      this.records.get(name)?.status.status === "connecting"
    ) {
      if (info.failureKind) {
        this.diagnostics.set(name, {
          failureKind: info.failureKind,
          ...(info.serverRequestId ? { serverRequestId: info.serverRequestId } : {}),
        });
      }
      return;
    }
    if (!info.serverRequestId) return;
    this.responseIdCache.set(info.spanId, info.serverRequestId);
    if (this.responseIdCache.size > MAX_TOOL_RESPONSE_IDS) {
      const first = this.responseIdCache.keys().next();
      if (!first.done) this.responseIdCache.delete(first.value);
    }
  }

  consumeToolResponse(spanId: string | undefined): string | undefined {
    if (!spanId) return undefined;
    const response = this.responseIdCache.get(spanId);
    this.responseIdCache.delete(spanId);
    return response;
  }
}
// 状态语义（跨模块读取点很多，字段与方法名不可改）：
// 一、generations 是「连接代号」：每次 advance 递增，异步回调据此判断自己是否已过期。
// 二、records 保存每个服务的配置、状态、工具与当前 client/transport；重连时整体替换。
// 三、diagnostics 记录最近一次失败诊断，成功路径不清理它，由上层在需要时读走。
// 四、responseIdCache 只保留最近 64 条工具响应 id，超出后按插入顺序淘汰最旧一条。
// 五、consumeToolResponse 是「读后即删」：同一 spanId 只能取到一次响应 id。
// 六、logger 由 options.logger 派生子作用域，附带连接上下文与 module 标记。
// 七、credentialStore 是可变字段：由门面在启动后注入，供 OAuth 刷新使用。
// 八、状态对象本身不做并发保护：调用方在同一事件循环内串行访问（见门面与生命周期模块）。
