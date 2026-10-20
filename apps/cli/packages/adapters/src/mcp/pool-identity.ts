// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
//
// 连接身份与连接键的计算。两条约定必须守住：
// 一、连接键必须稳定且无歧义：由「服务名 + 隔离键 + 配置稳定串」三段组成，
//     段间用 NUL 分隔 —— 任何一段自身含分隔符也不会与另一段混淆。
// 二、配置稳定串由 canonicalize 生成：对象键排序、跳过 undefined、数组保序、null 显式保留。
//
// 隔离粒度决定隔离键取自哪里：workspace 级用身份键（身份优先、路径兜底），
// session 级用 ownerId。身份键为空串时按「无身份」处理，与「未提供」等价。
// mcpConnectionId 每次创建都取新 UUID，不复用也不由配置派生。

import { randomUUID } from "node:crypto";
import type { McpConnectOptions, McpServerConfig } from "@knorvia/contracts";
import type { McpConnectionContext } from "./pool-identity-types.js";

export type { McpConnectionContext } from "./pool-identity-types.js";

/** 三段之间用 NUL 分隔：任何一段含其它分隔符都不会造成歧义。 */
const KEY_SEPARATOR = "\u0000";

/** 隔离粒度：workspace 与 session 两种。 */
const ISOLATION_WORKSPACE = "workspace";

/** 把任意值转成稳定串：对象键排序、跳过 undefined、数组保序、null 保留。 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) parts.push(canonicalize(item));
    return `[${parts.join(",")}]`;
  }
  const mapping = value as Record<string, unknown>;
  const entries: string[] = [];
  for (const key of Object.keys(mapping).sort()) {
    const item = mapping[key];
    if (item === undefined) continue;
    entries.push(`${JSON.stringify(key)}:${canonicalize(item)}`);
  }
  return `{${entries.join(",")}}`;
}

/** 身份键：优先用显式身份，其次工作目录；两者都空则无身份。 */
function workspaceIdentity(settings: McpConnectOptions): string | undefined {
  return settings.workspaceIdentity?.trim() || settings.workingDirectory?.trim() || undefined;
}

/** 隔离键：workspace 粒度取身份（缺省为空串），session 粒度取 ownerId。 */
function isolationKeyOf(
  config: McpServerConfig,
  settings: McpConnectOptions,
  ownerId: string,
): string {
  if (config.isolation !== ISOLATION_WORKSPACE) return ownerId;
  return workspaceIdentity(settings) ?? "";
}

export function connectionKey(
  serverName: string,
  config: McpServerConfig,
  settings: McpConnectOptions,
  ownerId: string,
): string {
  const segments = [serverName, isolationKeyOf(config, settings, ownerId), canonicalize(config)];
  return segments.join(KEY_SEPARATOR);
}

export function createConnectionContext(
  config: McpServerConfig,
  settings: McpConnectOptions,
  sessionId: string | undefined,
): McpConnectionContext {
  const isolation = config.isolation === ISOLATION_WORKSPACE ? ISOLATION_WORKSPACE : "session";
  const workspaceKey = workspaceIdentity(settings);
  const context = {} as McpConnectionContext;
  context.mcpConnectionId = randomUUID();
  context.mcpIsolation = isolation;
  // workspaceKey 只在有身份时出现；sessionId 只在 session 粒度下出现（缺席即不适用）。
  if (workspaceKey) context.workspaceKey = workspaceKey;
  if (isolation === "session" && sessionId) context.sessionId = sessionId;
  return context;
}
