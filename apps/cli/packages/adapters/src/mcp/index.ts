// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { McpPort } from "@knorvia/contracts";
import { McpClientApi } from "./client-api.js";
import type { CreateMcpAdapterOptions } from "./client-state.js";
import { createMcpConnectionPool, type McpConnectionPool } from "./pool.js";

export type { CreateMcpAdapterOptions } from "./client-state.js";

export function createMcpAdapter(options: CreateMcpAdapterOptions = {}): McpPort {
  return new McpClientApi(options);
}

export function createMcpAdapterConnectionPool(
  options: CreateMcpAdapterOptions = {},
): McpConnectionPool {
  return createMcpConnectionPool({
    createAdapter: ({ connectionContext, workingDirectory }) =>
      createMcpAdapter({
        ...options,
        connectionContext,
        workingDirectory: workingDirectory ?? options.workingDirectory,
      }),
    logger: options.logger,
    telemetry: options.telemetry,
  });
}

export {
  createMcpConnectionPool,
  type McpConnectionPool,
  type McpConnectionPoolOptions,
} from "./pool.js";
export {
  createMcpTelemetryTracker,
  resolvePluginName,
  type McpTelemetryTracker,
  type McpTrackedProcess,
} from "./telemetry.js";
