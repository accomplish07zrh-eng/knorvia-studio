// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { buildProtocolPermissionOptions } from "../../bootstrap/src/permission-options.js";
import { buildDefaultPermissionUpdates } from "../src/tool/executor/permission-suggestions.js";
import { applyPermissionUpdates } from "../src/tool/executor/permission-rules.js";
import { webFetchToolEntry } from "../src/tool/handlers/webfetch.js";
import { policyContext, policyService } from "./permission-policy-fixture.js";

const url = "https://example.org/docs?version=1#section";
const capability = { ...webFetchToolEntry.metadata, permission: webFetchToolEntry.permission };

function approvedUrlRules(approvedUrl: string) {
  const input = { url: approvedUrl, prompt: "Summarize this fixture" };
  const suggestedPermissionUpdates = buildDefaultPermissionUpdates("WebFetch", input);
  const options = buildProtocolPermissionOptions({
    toolName: "WebFetch",
    input,
    suggestedPermissionUpdates,
  });
  const approved = options.find((option) => option.optionId === "allow_project")!;
  assert.equal(approved.response.decision, "allow");
  return applyPermissionUpdates({ version: 1 }, approved.response.permissionUpdates!);
}

test("approving the exact WebFetch URL suppresses only the next identical permission request", () => {
  const service = policyService();
  const context = policyContext({ toolName: "WebFetch", input: { url } });
  assert.equal(service.checkPermission(context, capability).decision, "ask");
  const rules = approvedUrlRules(url);
  assert.deepEqual(rules.allow, [{ toolName: "WebFetch", ruleContent: url }]);
  assert.equal(service.checkPermission(context, capability, rules).ruleId, "rule.project.allow");
  for (const different of [
    "https://example.org/other?version=1#section",
    "https://example.org/docs?version=2#section",
    "https://example.org/docs?version=1#other",
    "http://example.org/docs?version=1#section",
    "https://example.org:443/docs?version=1#section",
    "https://EXAMPLE.ORG/docs?version=1#section",
    "https://sub.example.org/docs?version=1#section",
    ` ${url} `,
  ]) {
    assert.equal(
      service.checkPermission({ ...context, input: { url: different } }, capability, rules)
        .decision,
      "ask",
      different,
    );
  }
});

test("stars in an approved URL remain literal and do not turn that grant into a URL wildcard", () => {
  const approvedUrl = "https://example.org/docs/*?literal=*";
  const rules = approvedUrlRules(approvedUrl);
  const service = policyService();
  assert.equal(
    service.checkPermission(
      policyContext({ toolName: "WebFetch", input: { url: approvedUrl } }),
      capability,
      rules,
    ).ruleId,
    "rule.project.allow",
  );
  assert.equal(
    service.checkPermission(
      policyContext({
        toolName: "WebFetch",
        input: { url: "https://example.org/docs/private?literal=secret" },
      }),
      capability,
      rules,
    ).decision,
    "ask",
  );
});

test("exact URL rules apply equally to deny and ask, without overriding project deny priority", () => {
  const context = policyContext({ toolName: "WebFetch", input: { url } });
  const service = policyService();
  const rule = { toolName: "WebFetch", ruleContent: url };
  assert.equal(
    service.checkPermission(context, capability, { deny: [rule], allow: [rule] }).ruleId,
    "rule.project.deny",
  );
  assert.equal(
    service.checkPermission(context, capability, { ask: [rule], allow: [rule] }).ruleId,
    "rule.project.ask",
  );
});

test("explicit domain authorization retains its scope while non-URL patterns only see the domain", () => {
  const service = policyService();
  const context = policyContext({ toolName: "WebFetch", input: { url } });
  assert.equal(
    service.checkPermission(context, capability, {
      allow: [{ toolName: "WebFetch", ruleContent: "domain:example.org" }],
    }).ruleId,
    "rule.project.allow",
  );
  assert.equal(
    service.checkPermission(
      { ...context, input: { url: "https://example.org/another" } },
      capability,
      { allow: [{ toolName: "WebFetch", ruleContent: "domain:example.org" }] },
    ).ruleId,
    "rule.project.allow",
  );
  assert.equal(
    service.checkPermission(context, capability, {
      allow: [{ toolName: "WebFetch", ruleContent: "*docs*" }],
    }).decision,
    "ask",
  );
});
