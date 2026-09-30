// SPDX-License-Identifier: Apache-2.0
// Source-exposed reimplementation; see specs/knorvia-session-leaf-contract-8389.md.
import { existsSync } from "node:fs";
import { normalize } from "node:path";
import type { KnorviaAgentMcpServer } from "@knorvia/shared";

function scopeKey(path: string): string {
  const key = normalize(path.trim()).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? key.toLowerCase() : key;
}

export function appendWorkspaceToFilesystemMcpServers(
  mcpServers: KnorviaAgentMcpServer[] | undefined,
  workspacePath: string,
): KnorviaAgentMcpServer[] | undefined {
  if (!mcpServers?.length) return mcpServers;
  const workspace = workspacePath.trim();
  if (!workspace || !existsSync(workspace)) return mcpServers;

  const workspaceKey = scopeKey(workspace);
  let expanded: KnorviaAgentMcpServer[] | undefined;
  for (let index = 0; index < mcpServers.length; index++) {
    if (!(index in mcpServers)) continue;
    const server = mcpServers[index]!;
    if (!("command" in server) || server.name !== "filesystem") continue;
    if (!server.args.some((arg) => arg.includes("@modelcontextprotocol/server-filesystem")))
      continue;
    if (server.args.some((arg) => scopeKey(arg) === workspaceKey)) continue;

    // 仅为存在的本机 workspace 扩充临时授权，避免固定目录 MCP 拒绝当前项目；
    // 保持配置与原数组不变，不把远程路径持久化为本机授权。
    expanded ??= mcpServers.slice();
    expanded[index] = { ...server, args: [...server.args, workspace] };
  }
  return expanded ?? mcpServers;
}
