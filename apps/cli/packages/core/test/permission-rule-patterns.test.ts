// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { wildcardToRegExp, webFetchRuleSubjects } from "../src/permission/rule-matching.js";
import {
  matchesProjectRules,
  isPreapprovedWebFetchRequest,
} from "../src/permission/project-rule-matching.js";
import { resolvePermissionCapability } from "../src/permission/capability.js";
import { evaluateBashRules } from "../src/tool/handlers/bash-command-rule-evaluator.js";
import { policyContext } from "./permission-policy-fixture.js";

function match(pattern: string, input: unknown, toolName = "Fixture") {
  const context = policyContext({ toolName, input });
  return matchesProjectRules(
    { allow: [{ toolName, ruleContent: pattern }] },
    "allow",
    context,
    resolvePermissionCapability(context),
  );
}

test("wildcard compiler escapes every non-star regex token and retains anchoring and flags", () => {
  const special = "a.b+?^${}()|[]\\/fixture";
  const regex = wildcardToRegExp(special + "*end");
  assert.equal(regex.flags, "");
  assert.equal(regex.test(special + "end"), true);
  assert.equal(regex.test(special + " middle end"), true);
  assert.equal(regex.test("prefix" + special + "end"), false);
  assert.equal(regex.test(special + "end suffix"), false);
  assert.equal(regex.test(special + "\nend"), false);
  assert.equal(wildcardToRegExp("*").test(""), true);
  assert.equal(wildcardToRegExp("a**b").test("a😀b"), true);
  for (const ending of ["\n", "\r", "\r\n", "\u2028", "\u2029"])
    assert.equal(wildcardToRegExp("line*").test(`line${ending}`), false);
  assert.equal(wildcardToRegExp("line*").test("line\nnext"), false);
});

test("command-prefix suffix has priority and recognizes only a complete word or space/tab", () => {
  for (const command of ["echo", "echo fixture", "echo\tfixture"])
    assert.equal(match("echo:*", { command }), true);
  for (const command of ["echoes", "echo\nfixture", " echo", "echo\rfixture"])
    assert.equal(match("echo:*", { command }), false);
  assert.equal(match("ec*o:*", { command: "ec*o fixture" }), true);
  assert.equal(match("ec*o:*", { command: "echo fixture" }), false);
  assert.equal(match("ec*o", { command: "echo" }), true);
});

test("domain subjects retain URL normalization without conferring network validity", () => {
  const cases: [string, string[]][] = [
    ["  HTTPS://EXAMPLE.ORG.:443/path?q=x#fragment  ", ["domain:example.org"]],
    ["https://例子.测试/path", ["domain:xn--fsqu00a.xn--0zwm56d"]],
    ["http://[2001:db8::1]:8080/", ["domain:[2001:db8::1]"]],
    ["ftp://example.org/file", ["domain:example.org"]],
    ["https://example.org../", ["domain:example.org."]],
    ["not a URL", []],
    ["file:///fixture", []],
    ["data:text/plain,fixture", []],
  ];
  for (const [url, expected] of cases) assert.deepEqual(webFetchRuleSubjects(url), expected, url);
  assert.equal(
    match(
      "domain:example.org",
      { command: "ignored", url: "https://EXAMPLE.ORG/docs" },
      "WebFetch",
    ),
    true,
  );
  assert.equal(
    match("domain:*.example.org", { url: "https://api.example.org/docs" }, "WebFetch"),
    true,
  );
  assert.equal(
    match("domain:example.org", { url: "https://api.example.org/docs" }, "WebFetch"),
    false,
  );
});

test("preapproved URL check is scoped to WebFetch and preserves restricted documentation paths", () => {
  for (const url of [
    "https://docs.python.org/3/",
    "https://vercel.com/docs",
    "https://vercel.com/docs/functions",
  ]) {
    assert.equal(
      isPreapprovedWebFetchRequest(policyContext({ toolName: "WebFetch", input: { url } })),
      true,
    );
    assert.equal(isPreapprovedWebFetchRequest(policyContext({ input: { url } })), false);
  }
  for (const input of [
    null,
    "https://docs.python.org/3/",
    {},
    { url: 1 },
    { url: "https://vercel.com/docs-other" },
    { url: "https://vercel.com/docs/%252e%252e/" },
  ]) {
    assert.equal(
      isPreapprovedWebFetchRequest(policyContext({ toolName: "WebFetch", input })),
      false,
    );
  }
});

test("real Bash rule consumer retains all-group allow versus any-group ask/deny", () => {
  const input = {
    allSubjectGroups: [["echo fixture"], ["git status"]],
    requiredSubjectGroups: [["echo fixture"], ["git status"]],
    exactCommands: [],
    safe: true,
    rules: [{ toolName: "Bash", ruleContent: "echo:*" }],
  };
  assert.equal(evaluateBashRules({ ...input, behavior: "allow" }), false);
  assert.equal(evaluateBashRules({ ...input, behavior: "ask" }), true);
  assert.equal(evaluateBashRules({ ...input, behavior: "deny" }), true);
  assert.equal(
    evaluateBashRules({
      ...input,
      behavior: "allow",
      rules: [...input.rules, { toolName: "Bash", ruleContent: "git*" }],
    }),
    true,
  );
  assert.equal(evaluateBashRules({ ...input, behavior: "deny", safe: false }), false);
  assert.equal(
    evaluateBashRules({
      ...input,
      behavior: "allow",
      safe: false,
      exactCommands: ["echo:*"],
      rules: input.rules,
    }),
    true,
  );
});
