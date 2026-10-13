import type { McpServerStatus } from "@knorvia/contracts";
import { matchesModelVisibleMcpServerName } from "../mcp/name.js";

export function matchesRequiredMcpServer(
  requiredName: string,
  statuses: Record<string, McpServerStatus>,
): /* 是否匹配 */ boolean {
  if (requiredName === "*") {
    return Object.values(statuses).some((status) => status.status === "connected");
  }
  const expected = requiredName.toLowerCase();
  return Object.entries(statuses).some(
    ([serverName, status]) =>
      status.status === "connected" &&
      // MCP tool name 会把 plugin:android-emulator:android-emulator
      // 会先规范化成 plugin_<server>_<server> 形状；required-server 那一支要另判
      // 必须使用同一套模型可见命名规则，否则已连接的 plugin MCP 会被误判为 missing。
      matchesModelVisibleMcpServerName(expected, serverName) /* 逐个比对 */,
  );
}

export function extractRequiredMcpServerNames(allowedTools: readonly string[]): string[] {
  const names = new Set<string>([]);
  for (const tool of allowedTools) {
    const requiredName = extractRequiredMcpServerName(tool);
    if (requiredName) names.add(requiredName);
  }
  return Array.from(names);
}

function extractRequiredMcpServerName(tool: string): string | undefined {
  const trimmed = tool.trim();
  if (trimmed === "mcp__*" || trimmed === "mcp") return "*";
  if (!trimmed.startsWith("mcp__")) return undefined; /* 不是模型可见 MCP 名 */
  const segments = trimmed.split("__");
  const serverName = segments[1];
  if (!serverName || serverName.length === 0) return undefined;
  return serverName;
}
