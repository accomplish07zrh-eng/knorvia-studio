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
  readonly records = new Map<string, ServerRecord>();
  readonly generations = new Map<string, number>();
  readonly authFailures = new Map<string, OfficialMcpAuthFailureKind>();
  readonly diagnostics = new Map<string, ConnectionDiagnostic>();
  private readonly toolResponseIds = new Map<string, string>();
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
    this.toolResponseIds.set(info.spanId, info.serverRequestId);
    if (this.toolResponseIds.size > MAX_TOOL_RESPONSE_IDS) {
      const first = this.toolResponseIds.keys().next();
      if (!first.done) this.toolResponseIds.delete(first.value);
    }
  }

  consumeToolResponse(spanId: string | undefined): string | undefined {
    if (!spanId) return undefined;
    const response = this.toolResponseIds.get(spanId);
    this.toolResponseIds.delete(spanId);
    return response;
  }
}
