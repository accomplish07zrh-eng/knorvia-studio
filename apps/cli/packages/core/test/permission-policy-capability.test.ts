// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { PermissionCapabilityGroup } from "@knorvia/contracts";
import { resolvePermissionCapability } from "../src/permission/capability.js";
import { policyContext, policyService, permissionSpec } from "./permission-policy-fixture.js";

test("legacy name defaults include session helpers but never Object prototype names", () => {
  const service = policyService();
  for (const toolName of [
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
  ]) {
    const capability = resolvePermissionCapability(policyContext({ toolName }));
    assert.equal(capability.readOnly, true, toolName);
    assert.equal(capability.needsApproval, false);
    assert.equal(capability.sideEffectScope, "none");
    assert.equal(capability.riskLevel, "low");
    assert.equal(service.getRiskLevel(toolName), "low");
  }
  for (const toolName of [
    "Write",
    "Edit",
    "ApplyPatch",
    "Bash",
    "read",
    "Custom",
    "toString",
    "__proto__",
    "constructor",
  ]) {
    const capability = resolvePermissionCapability(policyContext({ toolName }));
    assert.equal(capability.readOnly, false, toolName);
    assert.equal(capability.needsApproval, true);
    assert.equal(capability.sideEffectScope, "workspace");
    assert.equal(capability.destructive, toolName === "Bash");
    assert.equal(service.getRiskLevel(toolName), "medium");
  }
});

test("explicit declaration fields win independently without mutating the caller's records", () => {
  const context = Object.freeze(policyContext({ toolName: "Read", riskLevel: "critical" }));
  const permission = Object.freeze(
    permissionSpec({
      alwaysAsk: true,
      riskLevel: "high",
      sideEffectScope: "system",
      needsApproval: false,
      askOptions: { allowAlways: false },
    }),
  );
  const input = Object.freeze({
    readOnly: false,
    destructive: true,
    alwaysAsk: false,
    sideEffectScope: "network" as const,
    riskLevel: "critical" as const,
    needsApproval: true,
    requiresUserInteraction: false,
    allowedInPlanMode: true,
    permissionCapabilityGroup: PermissionCapabilityGroup.OfficialCua,
    permission,
  });
  assert.deepEqual(resolvePermissionCapability(context, input), {
    allowedInPlanMode: true,
    alwaysAsk: true,
    allowSessionApproval: false,
    readOnly: false,
    destructive: true,
    requiresUserInteraction: false,
    sideEffectScope: "system",
    riskLevel: "high",
    needsApproval: false,
    permissionCapabilityGroup: PermissionCapabilityGroup.OfficialCua,
    permissionName: "fixture",
  });
  assert.equal(policyService().getRiskLevel("Read", input), "critical");
  assert.equal(policyService().checkPermission(context, input).riskLevel, "high");
});

test("readOnly override does not silently rewrite scope, approval requirement or risk defaults", () => {
  const capability = resolvePermissionCapability(policyContext({ riskLevel: "critical" }), {
    readOnly: true,
  });
  assert.equal(capability.readOnly, true);
  assert.equal(capability.sideEffectScope, "workspace");
  assert.equal(capability.needsApproval, true);
  assert.equal(capability.riskLevel, "medium");
  assert.equal(
    policyService().checkPermission(policyContext(), { readOnly: true }).decision,
    "ask",
  );
});

test("interaction requirement comes from explicit scope unless explicitly overridden", () => {
  for (const capability of [
    { sideEffectScope: "userInteraction" as const },
    { permission: permissionSpec({ sideEffectScope: "userInteraction" }) },
  ]) {
    assert.equal(
      resolvePermissionCapability(policyContext(), capability).requiresUserInteraction,
      true,
    );
    assert.equal(
      resolvePermissionCapability(policyContext(), {
        ...capability,
        requiresUserInteraction: false,
      }).requiresUserInteraction,
      false,
    );
  }
  assert.equal(
    resolvePermissionCapability(policyContext({ toolName: "AskUserQuestion" }))
      .requiresUserInteraction,
    false,
  );
});

test("public decision flags and requiresApproval distinguish denial from a prompt", () => {
  const service = policyService();
  assert.deepEqual(service.checkPermission(policyContext({ toolName: "Read" })), {
    decision: "allow",
    allowed: true,
    escalated: false,
    mode: "build",
    reason: "Build mode allows read-only tools",
    riskLevel: "low",
    ruleId: "mode.build.readOnly",
    sideEffectScope: "none",
  });
  assert.equal(service.requiresApproval(policyContext()), true);
  assert.equal(service.requiresApproval(policyContext({ mode: "auto" })), false);
  assert.equal(service.requiresApproval(policyContext({ mode: "yolo" })), false);
  for (const mode of ["build", "auto"] as const) {
    const result = service.checkPermission(policyContext({ mode }), { alwaysAsk: true });
    assert.equal(result.alwaysAsk, true);
    assert.equal(Object.hasOwn(result, "modifiedInput"), false);
  }
});
