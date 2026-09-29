// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import type { McpConnectOptions, McpServerConfig } from "@knorvia/contracts";

export interface McpConnectionContext {
  mcpConnectionId: string;
  mcpIsolation: "session" | "workspace";
  sessionId?: string;
  workspaceKey?: string;
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`);
  return `{${members.join(",")}}`;
}

function workspaceIdentity(options: McpConnectOptions): string | undefined {
  return options.workspaceIdentity?.trim() || options.workingDirectory?.trim() || undefined;
}

export function connectionKey(
  serverName: string,
  config: McpServerConfig,
  options: McpConnectOptions,
  ownerId: string,
): string {
  const scope = config.isolation === "workspace" ? (workspaceIdentity(options) ?? "") : ownerId;
  return `${serverName}\0${scope}\0${stableValue(config)}`;
}

export function createConnectionContext(
  config: McpServerConfig,
  options: McpConnectOptions,
  sessionId: string | undefined,
): McpConnectionContext {
  const isolation = config.isolation === "workspace" ? "workspace" : "session";
  const workspaceKey = workspaceIdentity(options);
  return {
    mcpConnectionId: randomUUID(),
    mcpIsolation: isolation,
    ...(workspaceKey ? { workspaceKey } : {}),
    ...(isolation === "session" && sessionId ? { sessionId } : {}),
  };
}
