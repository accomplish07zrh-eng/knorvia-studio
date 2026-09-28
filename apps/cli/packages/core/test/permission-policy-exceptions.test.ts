// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  AMEND_WORKFLOW_TOOL_NAME,
  PermissionCapabilityGroup,
  WORKFLOW_DRAFTS_DIR,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";
import { policyContext, policyService, permissionSpec } from "./permission-policy-fixture.js";

test("workflow ownership exemption uses resolved facts and retains hard deny and user-stop limits", () => {
  const toolName = AMEND_WORKFLOW_TOOL_NAME;
  const capability = { alwaysAsk: true };
  for (const mode of ["build", "edit", "plan", "yolo"] as const) {
    for (const stop_reason of [undefined, "failed", "completed", "cancelled", "other", "user"]) {
      for (const owned_by_this_session of [true, false, "true", undefined]) {
        const context = policyContext({
          toolName,
          mode,
          input: { predecessor: { owned_by_this_session, stop_reason } },
        });
        const expected =
          owned_by_this_session === true && stop_reason !== "user"
            ? "rule.session.workflowOwner"
            : "tool.alwaysAsk";
        assert.equal(policyService().checkPermission(context, capability).ruleId, expected);
        assert.equal(
          policyService({ disallowedTools: new Set([toolName]) }).checkPermission(
            context,
            capability,
          ).ruleId,
          "rule.disallowedTools",
        );
        assert.equal(
          policyService().checkPermission(context, capability, { version: 1, deny: [{ toolName }] })
            .ruleId,
          "rule.project.deny",
        );
      }
    }
  }
  for (const input of [null, {}, "predecessor", { predecessor: null }, { predecessor: "owned" }]) {
    assert.equal(
      policyService().checkPermission(policyContext({ toolName, input }), capability).ruleId,
      "tool.alwaysAsk",
    );
  }
  assert.equal(
    policyService().checkPermission(
      policyContext({ input: { predecessor: { owned_by_this_session: true } } }),
      capability,
    ).ruleId,
    "tool.alwaysAsk",
  );
});

test("WebFetch preapproval stays below deny, ask and plan, and above ordinary allowlist", () => {
  const service = policyService({ allowedTools: new Set(["WebFetch"]) });
  const capability = {
    permission: permissionSpec({ permission: "webfetch", sideEffectScope: "network" }),
  };
  const context = policyContext({
    toolName: "WebFetch",
    input: { url: "https://docs.python.org/3/" },
  });
  assert.equal(service.checkPermission(context, capability).ruleId, "tool.webfetch.preapproved");
  for (const behavior of ["deny", "ask"] as const) {
    assert.equal(
      service.checkPermission(context, capability, {
        version: 1,
        [behavior]: [{ toolName: "WebFetch", ruleContent: "domain:docs.python.org" }],
      }).ruleId,
      `rule.project.${behavior}`,
    );
  }
  assert.equal(
    service.checkPermission({ ...context, mode: "plan" }, capability).ruleId,
    "mode.plan.readOnly",
  );
  assert.equal(
    policyService().checkPermission(
      { ...context, input: { url: "https://example.invalid/" } },
      capability,
    ).ruleId,
    "mode.build.sideEffect",
  );
});

test("draft writes require an owned lexical target and do not bypass deny, ask or plan", () => {
  const workingDirectory = path.resolve("fixture-workspace");
  const draft = path.join(WORKFLOW_DRAFTS_DIR, "fixture.ts");
  const service = policyService();
  for (const toolName of ["Write", "Edit"]) {
    const context = policyContext({ toolName, workingDirectory, input: { file_path: draft } });
    assert.equal(service.checkPermission(context).ruleId, "tool.workflowDraft.preapproved");
    assert.equal(
      service.checkPermission({
        ...context,
        input: { file_path: path.resolve(workingDirectory, draft) },
      }).ruleId,
      "tool.workflowDraft.preapproved",
    );
    for (const behavior of ["deny", "ask"] as const) {
      assert.equal(
        service.checkPermission(context, {}, { version: 1, [behavior]: [{ toolName }] }).ruleId,
        `rule.project.${behavior}`,
      );
    }
    assert.equal(
      service.checkPermission({ ...context, mode: "plan" }).ruleId,
      "mode.plan.nonReadOnly",
    );
    assert.equal(
      service.checkPermission({ ...context, workingDirectory: undefined }).ruleId,
      "mode.build.sideEffect",
    );
    for (const file_path of [
      WORKFLOW_DRAFTS_DIR,
      `${WORKFLOW_DRAFTS_DIR}-other/fixture.ts`,
      "outside.ts",
      "",
    ]) {
      assert.equal(
        service.checkPermission({ ...context, input: { file_path } }).ruleId,
        "mode.build.sideEffect",
      );
    }
  }
  assert.equal(
    service.checkPermission(
      policyContext({ toolName: "ApplyPatch", workingDirectory, input: { file_path: draft } }),
    ).ruleId,
    "mode.build.sideEffect",
  );
});

test("service preserves scoped rule trust and one-way Edit-to-Write compatibility", () => {
  const service = policyService();
  const rules = { version: 1 as const, allow: [{ toolName: "Edit" }] };
  assert.equal(
    service.checkPermission(policyContext({ toolName: "Write" }), {}, rules).ruleId,
    "rule.project.allow",
  );
  assert.equal(
    service.checkPermission(
      policyContext({ toolName: "Edit" }),
      {},
      { version: 1, allow: [{ toolName: "Write" }] },
    ).ruleId,
    "mode.build.sideEffect",
  );
  const official = {
    version: 1 as const,
    deny: [{ toolName: OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME }],
  };
  assert.equal(
    service.checkPermission(
      policyContext({ toolName: OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME }),
      {},
      official,
    ).ruleId,
    "mode.build.sideEffect",
  );
  assert.equal(
    service.checkPermission(
      policyContext(),
      { permissionCapabilityGroup: PermissionCapabilityGroup.OfficialCua },
      official,
    ).ruleId,
    "rule.project.deny",
  );
});
