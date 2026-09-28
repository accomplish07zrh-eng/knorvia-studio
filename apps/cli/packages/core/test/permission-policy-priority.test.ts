// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  type PermissionRuleset,
  type PermissionUpdate,
} from "@knorvia/contracts";
import type { ToolPermissionRulePolicy } from "../src/tool/types.js";
import { PermissionService } from "../src/permission/service.js";
import {
  policyContext,
  policyConfig,
  policyService,
  permissionSpec,
} from "./permission-policy-fixture.js";

const allRules: PermissionRuleset = {
  version: 1,
  deny: [{ toolName: "Fixture" }],
  ask: [{ toolName: "Fixture" }],
  allow: [{ toolName: "Fixture" }],
};
const sessionAllow: PermissionUpdate[] = [
  { type: "addRules", behavior: "allow", rules: [{ toolName: "Fixture" }] },
];

test("plan control precedes modes and deny lists, with explicit planEnabled authoritative", () => {
  const service = policyService({
    disallowedTools: new Set([ENTER_PLAN_MODE_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME]),
  });
  for (const mode of ["build", "edit", "plan", "auto", "yolo"] as const) {
    const enter = service.checkPermission(
      policyContext({ mode, toolName: ENTER_PLAN_MODE_TOOL_NAME }),
      { alwaysAsk: true, requiresUserInteraction: true },
    );
    assert.equal(enter.ruleId, "tool.plan.enter");
    assert.equal(enter.alwaysAsk, true);
    assert.equal(
      service.checkPermission(
        policyContext({ mode, toolName: EXIT_PLAN_MODE_TOOL_NAME, planEnabled: false }),
      ).ruleId,
      "mode.plan.exitOnly",
    );
    assert.equal(
      service.checkPermission(
        policyContext({ mode, toolName: EXIT_PLAN_MODE_TOOL_NAME, planEnabled: true }),
        { requiresUserInteraction: true },
      ).ruleId,
      "rule.disallowedTools",
    );
  }
});

test("user interaction always asks except the hard tool deny, before project and auto policy", () => {
  for (const mode of ["build", "edit", "plan", "auto", "yolo"] as const) {
    const service = policyService({ allowedTools: new Set(["Fixture"]) });
    service.grantSessionPermission(sessionAllow);
    const capability = { requiresUserInteraction: true, alwaysAsk: true };
    assert.equal(
      service.checkPermission(policyContext({ mode }), capability, allRules).ruleId,
      "tool.userInteraction",
    );
    assert.equal(
      policyService({ disallowedTools: new Set(["Fixture"]) }).checkPermission(
        policyContext({ mode }),
        capability,
        allRules,
      ).ruleId,
      "rule.disallowedTools",
    );
  }
});

test("ordinary yolo compatibility does not weaken mandatory approval or an active plan", () => {
  const service = policyService({ disallowedTools: new Set(["Fixture"]) });
  assert.equal(
    service.checkPermission(policyContext({ mode: "yolo" }), {}, allRules).ruleId,
    "mode.yolo",
  );
  assert.equal(
    service.checkPermission(policyContext({ mode: "yolo", planEnabled: true }), {}, allRules)
      .ruleId,
    "rule.disallowedTools",
  );
  assert.equal(
    service.checkPermission(policyContext({ mode: "yolo" }), { alwaysAsk: true }, allRules).ruleId,
    "rule.disallowedTools",
  );
  assert.equal(
    service.checkPermission(policyContext({ mode: "auto" }), { alwaysAsk: true }, allRules).ruleId,
    "mode.auto.unimplemented",
  );
});

test("mandatory approval admits session grants after deny and ignores project allow or ask", () => {
  const service = policyService({ allowedTools: new Set(["Fixture"]) });
  const capability = {
    permission: permissionSpec({ alwaysAsk: true, askOptions: { allowAlways: "session" } }),
  };
  const rules: PermissionRuleset = { version: 1, ask: allRules.ask, allow: allRules.allow };
  for (const mode of ["build", "edit", "plan", "yolo"] as const) {
    assert.equal(
      service.checkPermission(policyContext({ mode }), capability, rules).ruleId,
      "tool.alwaysAsk",
    );
  }
  service.grantSessionPermission(sessionAllow);
  for (const mode of ["build", "edit", "plan", "yolo"] as const) {
    assert.equal(
      service.checkPermission(policyContext({ mode }), capability, rules).ruleId,
      "rule.session.allow",
    );
    assert.equal(
      service.checkPermission(policyContext({ mode }), capability, allRules).ruleId,
      "rule.project.deny",
    );
    assert.equal(
      service.checkPermission(
        policyContext({ mode }),
        { permission: permissionSpec({ alwaysAsk: true, askOptions: { allowAlways: false } }) },
        rules,
      ).ruleId,
      "tool.alwaysAsk",
    );
  }
  assert.equal(
    service.checkPermission(policyContext({ mode: "auto" }), capability, rules).ruleId,
    "mode.auto.unimplemented",
  );
  assert.equal(
    policyService().checkPermission(policyContext(), capability).ruleId,
    "tool.alwaysAsk",
  );
  assert.equal(service.checkPermission(policyContext()).ruleId, "rule.allowedTools");
  const ordinary = policyService();
  ordinary.grantSessionPermission(sessionAllow);
  assert.equal(ordinary.checkPermission(policyContext()).ruleId, "mode.build.sideEffect");
});

test("project deny then ask short circuit plan and allow, while plan blocks project allow", () => {
  const service = policyService({ allowedTools: new Set(["Fixture"]) });
  assert.equal(service.checkPermission(policyContext(), {}, allRules).ruleId, "rule.project.deny");
  assert.equal(
    service.checkPermission(
      policyContext({ mode: "plan" }),
      {},
      { version: 1, ask: allRules.ask, allow: allRules.allow },
    ).ruleId,
    "rule.project.ask",
  );
  assert.equal(
    service.checkPermission(
      policyContext({ mode: "plan" }),
      {},
      { version: 1, allow: allRules.allow },
    ).ruleId,
    "mode.plan.nonReadOnly",
  );
  assert.equal(
    service.checkPermission(policyContext(), {}, { version: 1, allow: allRules.allow }).ruleId,
    "rule.project.allow",
  );
});

test("custom rule policy keeps its receiver, scoped inputs, lazy order and original error", () => {
  const calls: string[] = [];
  const rules: PermissionRuleset = {
    version: 1,
    deny: [{ toolName: "Other" }, { toolName: "Fixture", ruleContent: "deny" }],
    ask: [{ toolName: "Fixture", ruleContent: "ask" }],
    allow: [{ toolName: "Fixture", ruleContent: "allow" }],
  };
  const policy: ToolPermissionRulePolicy = {
    suggestedPermissionUpdates: [],
    evaluateRules(behavior, received) {
      assert.equal(this, policy);
      assert.equal(received.length, 1);
      assert.equal(received[0]?.toolName, "Fixture");
      calls.push(behavior);
      return behavior === "ask";
    },
  };
  const service = policyService();
  assert.equal(
    service.checkPermission(policyContext(), {}, rules, policy).ruleId,
    "rule.project.ask",
  );
  assert.deepEqual(calls, ["deny", "ask"]);
  calls.length = 0;
  assert.equal(
    service.checkPermission(policyContext({ mode: "yolo" }), {}, rules, policy).decision,
    "allow",
  );
  assert.equal(calls.length, 0);
  const failure = { fixture: "rule failure" };
  policy.evaluateRules = () => {
    throw failure;
  };
  assert.throws(
    () => service.checkPermission(policyContext(), {}, rules, policy),
    (error) => error === failure,
  );
});

test("configuration remains caller owned and later Set or flag changes affect new evaluations", () => {
  const config = policyConfig();
  const service = new PermissionService(config);
  assert.equal(service.checkPermission(policyContext()).decision, "ask");
  config.allowedTools.add("Fixture");
  assert.equal(service.checkPermission(policyContext()).ruleId, "rule.allowedTools");
  config.disallowedTools.add("Fixture");
  assert.equal(service.checkPermission(policyContext()).ruleId, "rule.disallowedTools");
  config.allowMediumRiskInAutoMode = true;
  assert.equal(
    service.checkPermission(policyContext({ mode: "auto" })).ruleId,
    "mode.auto.unimplemented",
  );
});

test("a rule callback cannot change the already captured plan overlay for the current evaluation", () => {
  const context = policyContext({ planEnabled: true });
  const service = policyService();
  const policy: ToolPermissionRulePolicy = {
    suggestedPermissionUpdates: [],
    evaluateRules() {
      context.planEnabled = false;
      return false;
    },
  };
  const rules: PermissionRuleset = { version: 1, deny: [{ toolName: "Fixture" }] };
  assert.equal(service.checkPermission(context, {}, rules, policy).ruleId, "mode.plan.nonReadOnly");
  assert.equal(service.checkPermission(context).ruleId, "mode.build.sideEffect");
});

test("session grants added by a project-rule callback are visible in the same decision", () => {
  for (const allowAlways of ["session", false] as const) {
    const service = policyService();
    const calls: string[] = [];
    const policy: ToolPermissionRulePolicy = {
      suggestedPermissionUpdates: [],
      evaluateRules(behavior) {
        calls.push(behavior);
        if (behavior === "deny") service.grantSessionPermission(sessionAllow);
        return behavior === "allow";
      },
    };
    const capability = {
      permission: permissionSpec({ alwaysAsk: true, askOptions: { allowAlways } }),
    };
    const rules: PermissionRuleset = { version: 1, deny: [{ toolName: "Fixture" }] };
    const result = service.checkPermission(policyContext(), capability, rules, policy);
    assert.equal(result.ruleId, allowAlways === false ? "tool.alwaysAsk" : "rule.session.allow");
    assert.deepEqual(calls, allowAlways === false ? ["deny"] : ["deny", "allow"]);
  }
});
