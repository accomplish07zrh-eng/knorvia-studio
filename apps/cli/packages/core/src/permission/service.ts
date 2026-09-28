// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionRuleset, PermissionUpdate, RiskLevel } from "@knorvia/contracts";
import { applyPermissionUpdates } from "../tool/executor/permission-rules.js";
import type { ToolPermissionRulePolicy } from "../tool/types.js";
import { resolvePermissionCapability, resolveToolRiskLevel } from "./capability.js";
import { evaluatePermissionPolicy } from "./policy-evaluation.js";
import {
  defaultPermissionConfig,
  type PermissionConfig,
  type PermissionContext,
  type PermissionDecisionResult,
  type PermissionToolCapability,
} from "./types.js";
export {
  defaultPermissionConfig,
  type PermissionBehavior,
  type PermissionConfig,
  type PermissionContext,
  type PermissionDecisionResult,
  type PermissionToolCapability,
} from "./types.js";

/** One app owns one ephemeral grant set; policy evaluation itself has no mutable state. */
export class PermissionService {
  private sessionRules: PermissionRuleset = { version: 1 };

  constructor(private readonly config: PermissionConfig = defaultPermissionConfig) {}

  grantSessionPermission(updates: PermissionUpdate[]): void {
    this.sessionRules = applyPermissionUpdates(this.sessionRules, updates);
  }

  checkPermission(
    context: PermissionContext,
    toolCapability?: PermissionToolCapability,
    projectRules?: PermissionRuleset | null,
    rulePolicy?: ToolPermissionRulePolicy,
  ): PermissionDecisionResult {
    return evaluatePermissionPolicy({
      context,
      capability: resolvePermissionCapability(context, toolCapability),
      config: this.config,
      readSessionRules: () => this.sessionRules,
      projectRules,
      rulePolicy,
    });
  }

  requiresApproval(context: PermissionContext, toolCapability?: PermissionToolCapability): boolean {
    return this.checkPermission(context, toolCapability).decision === "ask";
  }

  getRiskLevel(toolName: string, toolCapability?: PermissionToolCapability): RiskLevel {
    return resolveToolRiskLevel(toolName, toolCapability);
  }
}
