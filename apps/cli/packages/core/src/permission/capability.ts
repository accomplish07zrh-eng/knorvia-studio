// 工具默认能力的纯解析；模式和规则决策仍由 PermissionService 负责。
import type { RiskLevel } from "@knorvia/contracts";
import type {
  PermissionContext,
  PermissionToolCapability,
  ResolvedPermissionCapability,
} from "./types.js";

export function resolveToolRiskLevel(
  toolName: string,
  toolCapability?: PermissionToolCapability,
): RiskLevel {
  if (toolCapability?.riskLevel) {
    return toolCapability.riskLevel;
  }

  if (isReadOnlyTool(toolName)) {
    return "low";
  }

  if (isWriteTool(toolName)) {
    return "medium";
  }

  if (isDestructiveTool(toolName)) {
    return "high";
  }

  return "medium";
}

function isReadOnlyTool(name: string): boolean {
  return new Set([
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "TodoRead",
    "TodoWrite",
    "AskUserQuestion",
    "Agent",
    "Task",
    "Skill",
  ]).has(name);
}

function isWriteTool(name: string): boolean {
  return new Set(["Write", "Edit", "ApplyPatch", "Bash"]).has(name);
}

function isDestructiveTool(name: string): boolean {
  return new Set(["Bash"]).has(name);
}

export function resolvePermissionCapability(
  context: PermissionContext,
  toolCapability?: PermissionToolCapability,
): ResolvedPermissionCapability {
  return {
    allowedInPlanMode: toolCapability?.allowedInPlanMode ?? false,
    alwaysAsk: toolCapability?.permission?.alwaysAsk ?? toolCapability?.alwaysAsk ?? false,
    allowSessionApproval: toolCapability?.permission?.askOptions?.allowAlways !== false,
    readOnly: toolCapability?.readOnly ?? isReadOnlyTool(context.toolName),
    destructive: toolCapability?.destructive ?? isDestructiveTool(context.toolName),
    requiresUserInteraction:
      toolCapability?.requiresUserInteraction ??
      (toolCapability?.permission?.sideEffectScope ?? toolCapability?.sideEffectScope) ===
        "userInteraction",
    sideEffectScope:
      toolCapability?.permission?.sideEffectScope ??
      toolCapability?.sideEffectScope ??
      (isReadOnlyTool(context.toolName) ? "none" : "workspace"),
    riskLevel:
      toolCapability?.permission?.riskLevel ??
      resolveToolRiskLevel(context.toolName, toolCapability),
    needsApproval:
      toolCapability?.permission?.needsApproval ??
      toolCapability?.needsApproval ??
      !isReadOnlyTool(context.toolName),
    permissionCapabilityGroup: toolCapability?.permissionCapabilityGroup,
    permissionName: toolCapability?.permission?.permission,
  };
}
