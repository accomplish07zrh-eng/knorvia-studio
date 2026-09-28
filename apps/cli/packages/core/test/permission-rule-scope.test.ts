// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  PermissionCapabilityGroup,
  type PermissionRuleValue,
  type PermissionRuleset,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";
import { resolvePermissionCapability } from "../src/permission/capability.js";
import { matchesProjectRules } from "../src/permission/project-rule-matching.js";
import type { ToolPermissionRulePolicy } from "../src/tool/types.js";
import { policyContext } from "./permission-policy-fixture.js";

function matches(
  toolName: string,
  rules: PermissionRuleValue[],
  input: unknown = {},
  policy?: ToolPermissionRulePolicy,
  trusted = false,
) {
  const context = policyContext({ toolName, input });
  const capability = resolvePermissionCapability(context, {
    permissionCapabilityGroup: trusted ? PermissionCapabilityGroup.OfficialCua : undefined,
  });
  return matchesProjectRules({ version: 1, allow: rules }, "allow", context, capability, policy);
}

test("rule names are exact, Edit covers Write in one direction, and CUA scope requires provenance", () => {
  assert.equal(matches("Write", [{ toolName: "Edit" }]), true);
  assert.equal(matches("Edit", [{ toolName: "Write" }]), false);
  assert.equal(matches("read", [{ toolName: "Read" }]), false);
  const official = [{ toolName: OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME }];
  assert.equal(matches(OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME, official), false);
  assert.equal(matches("Custom", official), false);
  assert.equal(matches("Custom", official, {}, undefined, true), true);
  assert.equal(matches("Other", [{ toolName: "Custom" }], {}, undefined, true), false);
});

test("a missing tool name cannot match an absent alias", () => {
  for (const toolName of ["Fixture", "Read", "Bash"])
    assert.equal(matches(toolName, [{} as PermissionRuleValue]), false);
});

test("a content callback cannot leave a later candidate authorized under a changed scope", () => {
  const later = { toolName: "Fixture" };
  const first = {
    toolName: "Fixture",
    get ruleContent() {
      later.toolName = "Other";
      return "not-matched";
    },
  };
  assert.equal(matches("Fixture", [first, later], "fixture"), false);
});

test("content is checked after reading the selected input subject", () => {
  const rule = { toolName: "Fixture", ruleContent: "before" };
  const input = {
    get command() {
      rule.ruleContent = "after";
      return "after";
    },
  };
  assert.equal(matches("Fixture", [rule], input), true);
});

test("missing behavior and absent scopes do not invoke custom policy or read content", () => {
  const context = policyContext();
  const capability = resolvePermissionCapability(context);
  const policy: ToolPermissionRulePolicy = {
    suggestedPermissionUpdates: [],
    evaluateRules() {
      throw new Error("must not evaluate");
    },
  };
  for (const rules of [
    undefined,
    null,
    { version: 1 as const },
    { version: 1 as const, allow: "invalid" } as unknown as PermissionRuleset,
  ]) {
    assert.equal(matchesProjectRules(rules, "allow", context, capability, policy), false);
  }
  assert.equal(
    matches(
      "Fixture",
      [
        {
          toolName: "Other",
          get ruleContent(): string {
            throw new Error("must not read");
          },
        },
      ],
      {},
      policy,
    ),
    false,
  );
});

test("scope selection completes before default matching even if the first rule is unconditional", () => {
  const failure = { fixture: "scope failure" };
  const rules = [
    { toolName: "Fixture" },
    {
      get toolName(): string {
        throw failure;
      },
    },
  ];
  assert.throws(
    () => matches("Fixture", rules),
    (error) => error === failure,
  );
});

test("custom policy owns matching after complete filtering and receives original ordered references", () => {
  const candidate = Object.freeze({ toolName: "Fixture", ruleContent: "ignored" });
  const rules = [candidate, { toolName: "Other" }, candidate];
  let calls = 0;
  const policy: ToolPermissionRulePolicy = {
    suggestedPermissionUpdates: [],
    evaluateRules(behavior, received) {
      assert.equal(this, policy);
      assert.equal(behavior, "allow");
      assert.notEqual(received, rules);
      assert.deepEqual(received, [candidate, candidate]);
      assert.equal(received[0], candidate);
      assert.equal(received[1], candidate);
      calls++;
      return false;
    },
  };
  const input = {
    get command(): string {
      throw new Error("custom port cannot fall through");
    },
  };
  assert.equal(matches("Fixture", rules, input, policy), false);
  assert.equal(calls, 1);
  const failure = { fixture: "port error" };
  policy.evaluateRules = () => {
    throw failure;
  };
  assert.throws(
    () => matches("Fixture", rules, input, policy),
    (error) => error === failure,
  );
});

test("unconditional content and the first successful rule short circuit unread input or later content", () => {
  const unreadable = {
    get command(): string {
      throw new Error("unreadable input");
    },
  };
  for (const ruleContent of [undefined, ""])
    assert.equal(matches("Fixture", [{ toolName: "Fixture", ruleContent }], unreadable), true);
  assert.equal(
    matches(
      "Fixture",
      [
        { toolName: "Fixture", ruleContent: "echo:*" },
        {
          toolName: "Fixture",
          get ruleContent(): string {
            throw new Error("late content");
          },
        },
      ],
      { command: "echo fixture" },
    ),
    true,
  );
});

test("the first string field wins, including empty strings, without trim or truthy selection", () => {
  const keys = ["command", "url", "file_path", "path", "pattern", "patch_text"];
  for (const [index, key] of keys.entries()) {
    const input = Object.fromEntries(
      keys.map((name, position) => [name, position < index ? 1 : name]),
    );
    assert.equal(matches("Fixture", [{ toolName: "Fixture", ruleContent: key }], input), true);
  }
  assert.equal(
    matches("Fixture", [{ toolName: "Fixture", ruleContent: "target" }], {
      command: "",
      file_path: "target",
    }),
    false,
  );
  assert.equal(
    matches("Fixture", [{ toolName: "Fixture", ruleContent: "target" }], " target "),
    false,
  );
  assert.equal(
    matches("Fixture", [{ toolName: "Fixture", ruleContent: " target " }], " target "),
    true,
  );
});
