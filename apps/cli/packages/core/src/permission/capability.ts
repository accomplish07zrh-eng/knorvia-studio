// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { RiskLevel } from "@knorvia/contracts";
import type {
  PermissionContext,
  PermissionToolCapability,
  ResolvedPermissionCapability,
} from "./types.js";

interface NameDefaults {
  readOnly: boolean;
  destructive: boolean;
  sideEffectScope: "none" | "workspace";
  needsApproval: boolean;
  riskLevel: RiskLevel;
}

const UNKNOWN: Readonly<NameDefaults> = Object.freeze({
  readOnly: false,
  destructive: false,
  sideEffectScope: "workspace",
  needsApproval: true,
  riskLevel: "medium",
});
const READ_ONLY: Readonly<NameDefaults> = Object.freeze({
  readOnly: true,
  destructive: false,
  sideEffectScope: "none",
  needsApproval: false,
  riskLevel: "low",
});
const NAME_DEFAULTS = new Map<string, Readonly<NameDefaults>>(
  [
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
  ].map((name) => [name, READ_ONLY]),
);
NAME_DEFAULTS.set("Bash", Object.freeze({ ...UNKNOWN, destructive: true }));

export function resolveToolRiskLevel(
  toolName: string,
  toolCapability?: PermissionToolCapability,
): RiskLevel {
  return toolCapability?.riskLevel || (NAME_DEFAULTS.get(toolName) ?? UNKNOWN).riskLevel;
}

/** Each property has its own precedence; a readOnly override cannot grant unrelated powers. */
export function resolvePermissionCapability(
  context: PermissionContext,
  toolCapability?: PermissionToolCapability,
): ResolvedPermissionCapability {
  const defaults = NAME_DEFAULTS.get(context.toolName) ?? UNKNOWN;
  const declared = toolCapability?.permission;
  const explicitScope = declared?.sideEffectScope ?? toolCapability?.sideEffectScope;
  return {
    allowedInPlanMode: toolCapability?.allowedInPlanMode ?? false,
    alwaysAsk: declared?.alwaysAsk ?? toolCapability?.alwaysAsk ?? false,
    allowSessionApproval: declared?.askOptions?.allowAlways !== false,
    readOnly: toolCapability?.readOnly ?? defaults.readOnly,
    destructive: toolCapability?.destructive ?? defaults.destructive,
    requiresUserInteraction:
      toolCapability?.requiresUserInteraction ?? explicitScope === "userInteraction",
    sideEffectScope: explicitScope ?? defaults.sideEffectScope,
    riskLevel: declared?.riskLevel ?? resolveToolRiskLevel(context.toolName, toolCapability),
    needsApproval:
      declared?.needsApproval ?? toolCapability?.needsApproval ?? defaults.needsApproval,
    permissionCapabilityGroup: toolCapability?.permissionCapabilityGroup,
    permissionName: declared?.permission,
  };
}
