// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: Apache-2.0
// 遥测的形状声明：三个导出类型由 telemetry.ts 原样再导出，公开面不变。
// McpProcessTelemetryIdentity：进程遥测身份（mcpId + 实例 id）。
// McpTrackedProcess：可枚举的被跟踪进程（pid / 服务名 / 来源 / 可选插件名）。
// McpTelemetryTracker：对外的遥测端口（方法名与入参字段名都是契约）。

import type { KnorviaMcpTelemetryEvent } from "@knorvia/shared";

type StartEvent = Extract<KnorviaMcpTelemetryEvent, { kind: "process_start" }>;
export type McpTelemetrySource = StartEvent["mcpSource"];
export type McpTelemetryIsolation = StartEvent["mcpIsolation"];

export interface McpProcessTelemetryIdentity {
  mcpId: string;
  mcpInstanceId: string;
}

export interface McpTrackedProcess {
  pid: number;
  serverName: string;
  mcpSource: McpTelemetrySource;
  pluginName?: string;
}

export interface McpTelemetryTracker {
  acquireOwner(input: { connectionId: string; ownerId: string; sessionId?: string }): void;
  recordSessionStartup(input: {
    configuredCount: number;
    connectedCount: number;
    failedCount: number;
    processCount: number;
    sessionId: string;
  }): void;
  recordProcessCrashed(input: {
    connectionId: string;
    exitCode: number | null;
    signal: string | null;
  }): void;
  recordProcessClosed(input: { connectionId: string }): void;
  recordProcessStarted(input: {
    connectionId: string;
    pid: number;
  }): McpProcessTelemetryIdentity | undefined;
  releaseOwner(input: { connectionId: string; ownerId: string }): void;
  registerConnection(input: {
    connectionId: string;
    isolation: McpTelemetryIsolation;
    serverName: string;
    source?: McpTelemetrySource;
  }): void;
  unregisterConnection(input: { connectionId: string }): void;
  listProcesses(): McpTrackedProcess[];
  sampleNow(): Promise<void>;
  start(): void;
  stop(): void;
}
