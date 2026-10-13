// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import type { McpConnectOptions, McpServerConfig } from "@knorvia/contracts";

export type { McpConnectionContext } from "./pool-identity-types.js";

import type { McpConnectionContext } from "./pool-identity-types.js";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const mapping = value as Record<string, unknown>;
  const entries = Object.keys(mapping)
    .sort()
    .filter((key) => mapping[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(mapping[key])}`);
  return `{${entries.join(",")}}`;
}

function workspaceIdentity(settings: McpConnectOptions): string | undefined {
  return settings.workspaceIdentity?.trim() || settings.workingDirectory?.trim() || undefined;
}

// 身份与连接键约定（实现侧）：
// 一、canonicalize 生成稳定串：对象键排序、跳过 undefined、数组保序、null 显式保留。
// 二、连接键由三段拼成：serverName、隔离作用域、配置的稳定串，段间用 NUL 分隔避免歧义。
// 三、隔离作用域：workspace 级用身份键（身份优先、路径兜底），session 级用 ownerId。
// 四、身份键为空字符串时按「无身份」处理，与「未提供」等价，避免两种空值走不同分支。
// 五、mcpConnectionId 每次创建都取新 UUID，不复用、不由配置派生。
// 六、workspaceKey / sessionId 只在对应隔离粒度下写入，始终保持「缺席即不适用」语义。
export function connectionKey(
  serverName: string,
  config: McpServerConfig,
  settings: McpConnectOptions,
  ownerId: string,
): string {
  const isolationKey =
    config.isolation === "workspace" ? (workspaceIdentity(settings) ?? "") : ownerId;
  return `${serverName}\0${isolationKey}\0${canonicalize(config)}`;
}

export function createConnectionContext(
  config: McpServerConfig,
  settings: McpConnectOptions,
  sessionId: string | undefined,
): McpConnectionContext {
  const isolation = config.isolation === "workspace" ? "workspace" : "session";
  const workspaceKey = workspaceIdentity(settings);
  return {
    mcpConnectionId: randomUUID(),
    mcpIsolation: isolation,
    ...(workspaceKey ? { workspaceKey } : {}),
    ...(isolation === "session" && sessionId ? { sessionId } : {}),
  };
}
