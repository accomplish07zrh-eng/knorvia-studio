// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { permissionPolicyProgram, type PolicyFacts } from "./policy-program.js";
import type { PermissionDecisionResult } from "./types.js";

export function evaluatePermissionPolicy(facts: PolicyFacts): PermissionDecisionResult {
  for (const rule of permissionPolicyProgram(facts)) {
    if (!rule.matches(facts)) continue;
    return {
      decision: rule.decision,
      allowed: rule.decision === "allow",
      escalated: rule.decision === "ask",
      mode: facts.context.mode,
      reason: typeof rule.reason === "string" ? rule.reason : rule.reason(facts),
      riskLevel: facts.capability.riskLevel,
      ruleId: rule.ruleId,
      sideEffectScope: facts.capability.sideEffectScope,
      ...(facts.capability.alwaysAsk ? { alwaysAsk: true } : {}),
    };
  }
  // 每条路线都有终止规则；程序破损不能默认为允许或伪装成用户拒绝。
  throw new Error("Permission policy program ended without a decision");
}
