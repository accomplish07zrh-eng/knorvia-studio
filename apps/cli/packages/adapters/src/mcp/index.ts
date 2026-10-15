// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 适配器门面：对外只暴露「建单个适配器」与「建连接池」两个入口，其余能力透传。
// 约定：
// 一、门面不做业务判断，只负责组装依赖并选择实现（单连接 = McpClientApi）。
// 二、连接池把「按连接上下文建适配器」的工厂交给 pool，由 pool 决定复用粒度。
// 三、未显式给出工作目录时，池内连接沿用门面级 workingDirectory，保证会话内行为一致。
// 四、logger 与 telemetry 原样透传，门面不自行创建日志或上报实例。
// 五、其余导出（连接池、遥测）直接转发自各自模块，避免调用方绕过门面拼路径。

import type { McpPort } from "@knorvia/contracts";
import { McpClientApi } from "./client-api.js";
import type { CreateMcpAdapterOptions } from "./client-state.js";
import {
  createMcpConnectionPool,
  type McpConnectionContext,
  type McpConnectionPool,
} from "./pool.js";

export type { CreateMcpAdapterOptions } from "./client-state.js";

/** 单连接适配器：门面的最薄一层。 */
export function createMcpAdapter(settings: CreateMcpAdapterOptions = {}): McpPort {
  return new McpClientApi(settings);
}

/** 池内一条连接的绑定信息：上下文必填，工作目录可缺省（缺省时沿用门面配置）。 */
interface PoolConnectionBinding {
  connectionContext: McpConnectionContext;
  workingDirectory?: string;
}

/** 池内一条连接的绑定：上下文必填，工作目录可缺省（缺省时沿用门面配置）。 */
interface PoolConnectionBinding {
  connectionContext: McpConnectionContext;
  workingDirectory?: string;
}

/** 池内某条连接的适配器：继承门面配置，并按连接补齐上下文与工作目录。 */
function poolAdapterFactory(settings: CreateMcpAdapterOptions) {
  return (binding: PoolConnectionBinding): McpPort =>
    createMcpAdapter({
      ...settings,
      connectionContext: binding.connectionContext,
      workingDirectory: binding.workingDirectory ?? settings.workingDirectory,
    });
}

/** 连接池：复用粒度、生命周期与清理都由 pool 负责。 */
export function createMcpAdapterConnectionPool(
  settings: CreateMcpAdapterOptions = {},
): McpConnectionPool {
  return createMcpConnectionPool({
    createAdapter: poolAdapterFactory(settings),
    logger: settings.logger,
    telemetry: settings.telemetry,
  });
}

export { createMcpConnectionPool } from "./pool.js";
export { type McpConnectionPool } from "./pool.js";
export { type McpConnectionPoolOptions } from "./pool.js";
export { createMcpTelemetryTracker } from "./telemetry.js";
export { resolvePluginName } from "./telemetry.js";
export { type McpTelemetryTracker } from "./telemetry.js";
export { type McpTrackedProcess } from "./telemetry.js";
