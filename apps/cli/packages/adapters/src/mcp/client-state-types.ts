// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 客户端状态的形状声明：由 client-state.ts 原样再导出，公开面不变。
// 字段说明（字段名是契约）：CreateMcpAdapterOptions 是门面配置；ServerRecord 是单服务记录；
// ConnectionDiagnostic 记录一次失败诊断（failureKind + 可选 serverRequestId）。

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
import type { NetworkEgressEnvPolicy } from "./network.js";
import type { McpOAuthRuntimeOptions } from "./oauth.js";
import type { McpConnectionContext } from "./pool.js";
import type { McpTelemetryTracker } from "./telemetry.js";
export interface CreateMcpAdapterOptions {
  clientName?: string;
  clientVersion?: string;
  connectionContext?: McpConnectionContext;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  telemetry?: McpTelemetryTracker;
  mcpOAuth?: McpOAuthRuntimeOptions;
  network?: NetworkEgressEnvPolicy;
  officialMcpAuth?: {
    authHeadersPort?: OfficialMcpAuthHeadersPort;
    trustedOrigins: OfficialMcpTrustedOriginRegistry;
    resolveKnorviaApiOrigin?: () => string;
    workspaceIdentity?: string;
  };
  workingDirectory?: string;
}

export type ProtocolTransport = Parameters<Client["connect"]>[0];
export interface ServerRecord {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpToolDescriptor[];
  client?: Client;
  transport?: ProtocolTransport;
  pending?: Promise<McpServerStatus>;
  owner?: AbortController;
}
export interface ConnectionDiagnostic {
  failureKind: McpServerFailureKind;
  serverRequestId?: string;
}
