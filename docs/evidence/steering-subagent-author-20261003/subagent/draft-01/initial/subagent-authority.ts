import { RESPOND_TO_COORDINATOR_TOOL_NAME } from "@knorvia/contracts";
import { createCoreError, CoreErrorType } from "../deps.js";
import type { ExploreSubagentRuntimeRequest, McpConnectionSnapshot, McpPort } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { toMcpToolName } from "../../mcp/index.js";
import { restrictBorrowedWindowsComputerUse } from "../../mcp/windows-computer-use.js";
import { createBorrowedSubagentMcpAccess } from "../../subagent/borrowed-mcp-port.js";
import { extractRequiredMcpServerNames, matchesRequiredMcpServer } from "../../subagent/mcp-config.js";
import { buildSubagentChildDisallowRules, filterSubagentChildToolNames } from "../../subagent/tool-policy.js";
import { isSubagentDispatchToolName } from "../../tool/compat.js";

export interface ChildMcpAccess {
  config: { enabled: boolean } | undefined;
  parentSnapshot: McpConnectionSnapshot | undefined;
  port: McpPort | undefined;
  snapshot: McpConnectionSnapshot | undefined;
}

function isServerSelector(name: string): boolean {
  return name === "mcp" || (name.startsWith("mcp__") && name.endsWith("__*"));
}

function isConcreteMcpTool(name: string): boolean {
  return name.startsWith("mcp__") && !isServerSelector(name);
}

function unavailable(agentType: string, requiredMcpTools: string[] = []) {
  return createCoreError(
    CoreErrorType.ConfigurationError,
    "Subagent MCP is unavailable because the parent startup snapshot is unavailable",
    { context: { agentType, requiredMcpTools }, recoverable: true },
  );
}

function disconnected(agentType: string, missingMcpServers: string[]) {
  return createCoreError(
    CoreErrorType.ConfigurationError,
    "Required MCP server is not connected: " + missingMcpServers.join(", "),
    { context: { agentType, missingMcpServers }, recoverable: true },
  );
}

export async function resolveChildMcpAccess(
  parent: AgentRuntimeInternal,
  request: ExploreSubagentRuntimeRequest,
  officialNames: Parameters<typeof createBorrowedSubagentMcpAccess>[3],
): Promise<ChildMcpAccess> {
  const profile = request.profile;
  const borrow =
    (profile.mcpServers?.length ?? 0) > 0 ||
    request.allowedTools.length === 0 ||
    request.allowedTools.includes("*") ||
    request.allowedTools.some((name) => {
      const trimmed = name.trim();
      return isConcreteMcpTool(trimmed) || isServerSelector(trimmed);
    });
  if (!borrow) {
    return { config: undefined, parentSnapshot: undefined, port: undefined, snapshot: undefined };
  }
  const scopedServerNames = profile.mcpServers?.length ? profile.mcpServers : undefined;
  if (!parent.mcpPort || parent.config.mcp?.enabled === false) {
    if (scopedServerNames) throw unavailable(request.agentType);
    return {
      config: parent.config.mcp?.enabled === false ? { enabled: false } : undefined,
      parentSnapshot: undefined,
      port: undefined,
      snapshot: undefined,
    };
  }
  const parentSnapshot = await parent.mcpStartupPromise;
  if (!parentSnapshot) {
    if (scopedServerNames) throw unavailable(request.agentType);
    return { config: undefined, parentSnapshot: undefined, port: undefined, snapshot: undefined };
  }
  const missingMcpServers = scopedServerNames?.filter(
    (name) => parentSnapshot.statuses[name]?.status !== "connected",
  );
  if (missingMcpServers?.length) throw disconnected(request.agentType, missingMcpServers);
  const borrowed = restrictBorrowedWindowsComputerUse(
    createBorrowedSubagentMcpAccess(parent.mcpPort, parentSnapshot, scopedServerNames, officialNames),
    new Set(parent.config.mcp?.trustedWindowsComputerUseServerNames ?? []),
  );
  return {
    config: { enabled: true },
    parentSnapshot,
    port: borrowed.port,
    snapshot: borrowed.snapshot,
  };
}

export function resolveChildToolAllowlist(
  parent: AgentRuntimeInternal,
  request: ExploreSubagentRuntimeRequest,
  visibleMcpTools: string[],
): string[] {
  const rules = buildSubagentChildDisallowRules([
    ...(parent.config.toolDisallowlist ?? []),
    ...(request.disallowedTools ?? []),
  ]);
  let names: string[];
  if (request.allowedTools.length === 0 || request.allowedTools.includes("*")) {
    const mcpNames = parent.config.toolAllowlist === undefined
      ? visibleMcpTools
      : visibleMcpTools.filter((name) => parent.config.toolAllowlist?.includes(name));
    const parentNames = parent.getTools()
      .filter((tool) => tool.permission?.permission !== "mcp")
      .map((tool) => tool.name);
    names = [...new Set([...parentNames, ...mcpNames])].filter(
      (name) => !isSubagentDispatchToolName(name) && filterSubagentChildToolNames([name], rules).length > 0,
    );
  } else {
    names = filterSubagentChildToolNames(request.allowedTools, rules);
  }
  return names.includes(RESPOND_TO_COORDINATOR_TOOL_NAME)
    ? names
    : [...names, RESPOND_TO_COORDINATOR_TOOL_NAME];
}

export function validateChildMcpRequirements(
  request: ExploreSubagentRuntimeRequest,
  effectiveAllowedTools: string[],
  access: ChildMcpAccess,
): void {
  if (request.allowedTools.length === 0 || request.allowedTools.includes("*")) return;
  const trimmed = effectiveAllowedTools.map((name) => name.trim());
  const requiredToolNames = trimmed.filter(isConcreteMcpTool);
  const requiredServerNames = extractRequiredMcpServerNames(trimmed.filter(isServerSelector));
  if (requiredToolNames.length === 0 && requiredServerNames.length === 0) return;
  if (!access.port || !access.snapshot) throw unavailable(request.agentType, requiredToolNames);
  const missingMcpServers = requiredServerNames.filter(
    (name) => !matchesRequiredMcpServer(name, access.snapshot!.statuses),
  );
  if (missingMcpServers.length) throw disconnected(request.agentType, missingMcpServers);
  const visible = new Set(access.snapshot.tools.map(toMcpToolName));
  const missingMcpTools = requiredToolNames.filter((name) => !visible.has(name));
  if (missingMcpTools.length) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Required MCP tool is not available in the parent startup snapshot: " + missingMcpTools.join(", "),
      { context: { agentType: request.agentType, missingMcpTools }, recoverable: true },
    );
  }
}
