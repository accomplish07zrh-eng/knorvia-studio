// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 适配器门面。对外只有两个入口：建单个适配器、建带池的适配器；其余能力原样转发。
//
// 门面自身的约定：
// 一、不做业务判断，只组装依赖并选实现（单连接由 McpClientApi 承担）。
// 二、连接池需要「按连接上下文造适配器」的工厂，复用粒度交给 pool 决定。
// 三、调用方没给工作目录时，池内连接沿用门面级配置，保证同一会话里行为一致。
// 四、logger 与 telemetry 原样透传，门面自己从不创建日志或上报实例。
// 五、连接池与遥测的导出直接转发自各自模块，避免调用方绕过门面拼路径。

import type { McpPort } from "@knorvia/contracts";
import { McpClientApi } from "./client-api.js";
import type { CreateMcpAdapterOptions } from "./client-state.js";
import {
  createMcpConnectionPool,
  type McpConnectionContext,
  type McpConnectionPool,
} from "./pool.js";

export type { CreateMcpAdapterOptions } from "./client-state.js";

/** 单连接适配器：门面的最薄一层，直接交给 McpClientApi。 */
export function createMcpAdapter(settings: CreateMcpAdapterOptions = {}): McpPort {
  return new McpClientApi(settings);
}

/** 池内一条连接需要补齐的两项：连接上下文，以及可选的工作目录覆盖。 */
type PoolConnectionBinding = {
  connectionContext: McpConnectionContext;
  workingDirectory?: string;
};

/**
 * 把门面配置与连接绑定合并成一份完整配置。
 * 工作目录的优先级：绑定上的值 → 门面配置 → 不设（由下游取默认）。
 */
function mergeConnectionSettings(
  settings: CreateMcpAdapterOptions,
  binding: PoolConnectionBinding,
): CreateMcpAdapterOptions {
  const merged = { ...settings };
  merged.connectionContext = binding.connectionContext;
  merged.workingDirectory = binding.workingDirectory ?? settings.workingDirectory;
  return merged;
}

/** 带连接池的适配器入口：复用粒度、生命周期与清理都由 pool 负责。 */
export function createMcpAdapterConnectionPool(
  settings: CreateMcpAdapterOptions = {},
): McpConnectionPool {
  const createAdapter = (binding: PoolConnectionBinding): McpPort =>
    createMcpAdapter(mergeConnectionSettings(settings, binding));
  return createMcpConnectionPool({
    createAdapter,
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
