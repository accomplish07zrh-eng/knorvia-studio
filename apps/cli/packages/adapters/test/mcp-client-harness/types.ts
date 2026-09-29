// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export type UnknownRecord = Record<string, unknown>;

export interface McpStatus extends UnknownRecord {
  status: string;
  toolCount: number;
  transport: string;
  updatedAt: string;
}

export interface McpPortLike {
  callTool(request: UnknownRecord, options?: UnknownRecord): Promise<UnknownRecord>;
  close(): Promise<void>;
  connectConfiguredServers(
    servers: Record<string, UnknownRecord>,
    options?: UnknownRecord,
  ): Promise<{ statuses: Record<string, McpStatus>; tools: unknown[] }>;
  connectServer(name: string, config: UnknownRecord, options?: UnknownRecord): Promise<McpStatus>;
  disconnectServer(name: string): Promise<McpStatus | undefined>;
  listTools(): Promise<unknown[]>;
  pingServer?(name: string, options?: UnknownRecord): Promise<boolean>;
  status(): Promise<Record<string, McpStatus>>;
}

export interface CandidateExports {
  createMcpAdapter(options?: UnknownRecord): McpPortLike;
  createMcpAdapterConnectionPool(options?: UnknownRecord): unknown;
  createMcpConnectionPool: unknown;
  createMcpTelemetryTracker: unknown;
  resolvePluginName: unknown;
}

export interface SeamCall {
  args: unknown[];
  key: string;
  receiver: unknown;
  sequence: number;
}

export type SeamHook = (receiver: unknown, ...args: unknown[]) => unknown;

export interface TimerTask {
  callback: () => void;
  dueAt: number;
  id: number;
}

export interface LoggerLike {
  child(context: UnknownRecord): LoggerLike;
  debug(message: string, context?: UnknownRecord): void;
  error(message: string, error?: Error, context?: UnknownRecord): void;
  info(message: string, context?: UnknownRecord): void;
  warn(message: string, context?: UnknownRecord): void;
}
