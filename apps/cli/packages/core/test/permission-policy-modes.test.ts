// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionToolCapability } from "../src/permission/types.js";
import { policyContext, policyService, permissionSpec } from "./permission-policy-fixture.js";

test("plan permits only the three established capability classes in their declared order", () => {
  const service = policyService();
  const cases: [PermissionToolCapability, string][] = [
    [{ readOnly: true, needsApproval: true, riskLevel: "critical" }, "mode.plan.readOnly"],
    [{ permission: permissionSpec({ permission: "mcp" }) }, "mode.plan.mcp"],
    [{ readOnly: true, permission: permissionSpec({ permission: "mcp" }) }, "mode.plan.readOnly"],
    [
      { allowedInPlanMode: true, sideEffectScope: "session", needsApproval: false },
      "mode.plan.explicitSessionCapability",
    ],
    [
      { allowedInPlanMode: true, sideEffectScope: "workspace", needsApproval: false },
      "mode.plan.nonReadOnly",
    ],
    [
      { allowedInPlanMode: true, sideEffectScope: "session", needsApproval: true },
      "mode.plan.nonReadOnly",
    ],
    [{ readOnly: true, destructive: true }, "mode.plan.nonReadOnly"],
    [
      { destructive: true, permission: permissionSpec({ permission: "mcp" }) },
      "mode.plan.nonReadOnly",
    ],
    [{}, "mode.plan.nonReadOnly"],
  ];
  for (const [capability, expected] of cases) {
    for (const mode of ["build", "edit", "yolo", "plan"] as const) {
      assert.equal(
        service.checkPermission(policyContext({ mode, planEnabled: true }), capability).ruleId,
        expected,
      );
    }
  }
});

test("planEnabled explicitly false disables the plan overlay but prePlanMode never selects policy", () => {
  const service = policyService();
  for (const prePlanMode of [undefined, "build", "edit", "yolo", "auto"] as const) {
    assert.equal(
      service.checkPermission(policyContext({ mode: "plan", prePlanMode, planEnabled: false }))
        .ruleId,
      "mode.build.sideEffect",
    );
    assert.equal(
      service.checkPermission(policyContext({ mode: "yolo", prePlanMode, planEnabled: false }))
        .ruleId,
      "mode.yolo",
    );
    assert.equal(
      service.checkPermission(policyContext({ mode: "auto", prePlanMode, planEnabled: true }))
        .ruleId,
      "mode.auto.unimplemented",
    );
  }
});

test("build preserves readonly priority, critical prompts, high-risk opt-in and session controls", () => {
  const cases: [PermissionToolCapability, string, string][] = [
    [
      { readOnly: true, needsApproval: false, riskLevel: "critical" },
      "mode.build.readOnly",
      "mode.build.readOnly",
    ],
    [
      { sideEffectScope: "none", needsApproval: false, riskLevel: "critical" },
      "mode.build.criticalRisk",
      "mode.build.criticalRisk",
    ],
    [
      { sideEffectScope: "none", needsApproval: false, riskLevel: "high" },
      "mode.build.highRisk",
      "mode.build.lowRisk",
    ],
    [
      { sideEffectScope: "system", needsApproval: false, riskLevel: "high" },
      "mode.build.highRisk",
      "mode.build.sideEffect",
    ],
    [
      { sideEffectScope: "session", needsApproval: false, riskLevel: "low" },
      "mode.build.sessionState",
      "mode.build.sessionState",
    ],
    [
      { sideEffectScope: "session", needsApproval: false, riskLevel: "medium" },
      "mode.build.sideEffect",
      "mode.build.sideEffect",
    ],
    [
      { sideEffectScope: "none", needsApproval: false, destructive: true },
      "mode.build.sideEffect",
      "mode.build.sideEffect",
    ],
    [{ sideEffectScope: "none", needsApproval: false }, "mode.build.lowRisk", "mode.build.lowRisk"],
    [
      { sideEffectScope: "none", needsApproval: true },
      "mode.build.sideEffect",
      "mode.build.sideEffect",
    ],
  ];
  for (const autoApproveHighRisk of [false, true]) {
    const service = policyService({ autoApproveHighRisk });
    for (const [capability, normal, auto] of cases) {
      assert.equal(
        service.checkPermission(policyContext(), capability).ruleId,
        autoApproveHighRisk ? auto : normal,
      );
    }
  }
});

test("edit exemption requires both the edit permission and workspace scope", () => {
  const service = policyService();
  const context = policyContext({ mode: "edit" });
  const edit = {
    destructive: true,
    permission: permissionSpec({ permission: "edit", riskLevel: "critical" }),
  };
  assert.equal(service.checkPermission(context, edit).ruleId, "mode.edit.fileEdit");
  assert.equal(
    service.checkPermission(context, { ...edit, alwaysAsk: true }).ruleId,
    "tool.alwaysAsk",
  );
  assert.equal(
    service.checkPermission(context, {
      permission: permissionSpec({ permission: "edit", sideEffectScope: "system" }),
    }).ruleId,
    "mode.build.sideEffect",
  );
  assert.equal(
    service.checkPermission(context, { permission: permissionSpec({ permission: "other" }) })
      .ruleId,
    "mode.build.sideEffect",
  );
});
