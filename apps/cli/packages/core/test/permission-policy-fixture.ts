// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolPermissionSpec } from "@knorvia/contracts";
import {
  PermissionService,
  type PermissionConfig,
  type PermissionContext,
} from "../src/permission/service.js";

export function policyContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return { toolName: "Fixture", input: {}, riskLevel: "medium", mode: "build", ...overrides };
}

export function policyConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return {
    allowedTools: new Set(),
    disallowedTools: new Set(),
    autoApproveHighRisk: false,
    allowMediumRiskInAutoMode: false,
    ...overrides,
  };
}

export function permissionSpec(overrides: Partial<ToolPermissionSpec> = {}): ToolPermissionSpec {
  return {
    permission: "fixture",
    reason: "Fixture policy",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["input"],
    denyPriority: "beforeAsk",
    ...overrides,
  };
}

export function policyService(config: Partial<PermissionConfig> = {}): PermissionService {
  return new PermissionService(policyConfig(config));
}
