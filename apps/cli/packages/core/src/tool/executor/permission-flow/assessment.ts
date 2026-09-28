// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionRuleset } from "@knorvia/contracts";
import type { PermissionContext } from "../../../permission/service.js";
import { applyPreToolPermissionDecision } from "../hook-flow.js";
import { applyMemoryFilePermission } from "../memory-file-permission.js";
import {
  resolveRuntimePermissionCapability,
  resolveRuntimePermissionContext,
} from "../permission-capability.js";
import { buildDefaultPermissionUpdates } from "../permission-suggestions.js";
import type { PermissionInvocation } from "./plan-driver.js";

/** Capture the pre-storage facts once; service evaluation happens only after rules arrive. */
export function captureAssessment({ deps, call, entry, input, mode }: PermissionInvocation) {
  const context: PermissionContext = {
    toolName: call.name,
    input,
    riskLevel: entry.metadata.riskLevel,
    mode,
    prePlanMode: deps.sessionModePort?.getPrePlanMode(),
    planEnabled: deps.sessionModePort?.isPlanEnabled?.(),
    workingDirectory: deps.getWorkingDirectory(),
  };
  const runtime = resolveRuntimePermissionContext(deps);
  const policy = entry.resolvePermissionRulePolicy?.(input, runtime);
  const suggestions =
    entry.approvalAuthority === "user"
      ? []
      : (policy?.suggestedPermissionUpdates ??
        buildDefaultPermissionUpdates(call.name, input, entry.permissionCapabilityGroup));
  return { context, runtime, policy, suggestions };
}

export function evaluateAssessment(
  invocation: PermissionInvocation,
  facts: ReturnType<typeof captureAssessment>,
  rules: PermissionRuleset | null,
) {
  const { deps, call, entry, input, hook, mode } = invocation;
  const evaluated = deps.permissionService.checkPermission(
    facts.context,
    resolveRuntimePermissionCapability(entry, input, facts.runtime),
    rules,
    facts.policy,
  );
  const preTool = applyPreToolPermissionDecision(evaluated, hook, mode);
  return applyMemoryFilePermission({
    decision: preTool,
    executionInput: input,
    memoryRoot: deps.getMemoryRoot?.(),
    toolName: call.name,
    workingDirectory: deps.getWorkingDirectory(),
    workspaceRoot: deps.getWorkspaceRoot(),
  });
}
