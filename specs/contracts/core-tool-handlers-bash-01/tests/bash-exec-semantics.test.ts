// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01 contract tests: bash execution semantics, command parsing,
// permission rule evaluation, cwd policy, git runtime safety and the gh rate-limit hint.
// Black box: asserts only public exports. Expected values are the recorded old-implementation
// judgments (the baseline the rewrite must reproduce).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSilentBashCommand,
  interpretBashReturnCode,
  isBashProviderErrorStatus,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-semantics.js";
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-command-parser.js";
import { evaluateBashRules } from "../../../../apps/cli/packages/core/src/tool/handlers/bash-command-rule-evaluator.js";
import {
  decideBashCwdPolicy,
  appendBashCwdStderrSuffix,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-cwd-policy.js";
import {
  analysisContainsGitCommand,
  analysisContainsGitAndDirectoryChange,
  isGitRuntimeContextUnsafe,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-git-runtime-safety.js";
import { getGhRateLimitHint } from "../../../../apps/cli/packages/core/src/tool/handlers/bash-gh-rate-limit.js";

test("B-ex-1 isSilentBashCommand flags only the silent command set", () => {
  assert.equal(isSilentBashCommand("mkdir newdir"), true);
  assert.equal(isSilentBashCommand("rm file.txt"), true);
  assert.equal(isSilentBashCommand("ls -la"), false);
  assert.equal(isSilentBashCommand("echo hi"), false);
});

test("B-ex-2 isSilentBashCommand aggregates pipelines and skips || fallbacks", () => {
  assert.equal(isSilentBashCommand("mkdir a && rm b"), true);
  assert.equal(isSilentBashCommand("mkdir a || true"), true);
});

test("B-ex-3 isSilentBashCommand rejects unparseable input", () => {
  assert.equal(isSilentBashCommand("echo 'unterminated"), false);
});

test("B-ex-4 interpretBashReturnCode maps terminal statuses", () => {
  assert.equal(interpretBashReturnCode("ls", { status: "timed_out" }), "Command timed out");
  assert.equal(interpretBashReturnCode("ls", { status: "cancelled" }), "Command was cancelled");
  assert.equal(interpretBashReturnCode("ls", { status: "spawn_error" }), "Command failed to start");
  assert.equal(
    interpretBashReturnCode("ls", {
      status: "completed",
      error: { type: "output_limit", message: "x" },
    }),
    "Command stopped because output exceeded the configured limit",
  );
});

test("B-ex-5 interpretBashReturnCode gives semantic non-error readings for exit 1", () => {
  assert.equal(
    interpretBashReturnCode("grep foo file.txt", { status: "completed", exitCode: 1 }),
    "No matches found",
  );
  assert.equal(
    interpretBashReturnCode("diff a b", { status: "completed", exitCode: 1 }),
    "Files differ",
  );
  assert.equal(
    interpretBashReturnCode("test -f x", { status: "completed", exitCode: 1 }),
    "Condition is false",
  );
});

test("B-ex-6 interpretBashReturnCode falls back to the exit code and signal", () => {
  assert.equal(
    interpretBashReturnCode("ls", { status: "completed", exitCode: 2 }),
    "Command exited with code 2",
  );
  assert.equal(interpretBashReturnCode("ls", { status: "completed", exitCode: 0 }), undefined);
  assert.equal(
    interpretBashReturnCode("sleep 5", { status: "completed", exitCode: 0, signal: "SIGTERM" }),
    "Command exited due to signal SIGTERM",
  );
});

test("B-ex-7 isBashProviderErrorStatus treats only failed non-zero non-semantic as errors", () => {
  assert.equal(isBashProviderErrorStatus({ status: "failed", exitCode: 1 }), true);
  assert.equal(
    isBashProviderErrorStatus({
      status: "failed",
      exitCode: 1,
      returnCodeInterpretation: "No matches found",
    }),
    false,
  );
  assert.equal(isBashProviderErrorStatus({ status: "completed", exitCode: 0 }), false);
  assert.equal(isBashProviderErrorStatus({ status: "failed", exitCode: 0 }), false);
});

test("B-ex-8 analyzeBashCommand splits a pipeline into named invocations", () => {
  const analysis = analyzeBashCommand("ls | grep foo");
  assert.equal(analysis.commands.length, 2);
  assert.deepEqual(
    analysis.commands.map((c) => c.name),
    ["ls", "grep"],
  );
  assert.equal(analysis.hasRedirects, false);
  assert.equal(analysis.hasDynamicWords, false);
  assert.equal(analysis.hasParseErrors, false);
  assert.equal(analysis.hasUnsupportedSyntax, false);
});

test("B-ex-9 analyzeBashCommand records output redirection", () => {
  const analysis = analyzeBashCommand("echo hi > out.txt");
  assert.equal(analysis.hasRedirects, true);
  const redirect = analysis.commands[0]?.redirects[0];
  assert.equal(redirect?.operator, ">");
  assert.equal(redirect?.target, "out.txt");
});

test("B-ex-10 analyzeBashCommand detects dynamic words and operators", () => {
  assert.equal(analyzeBashCommand("echo $(date)").hasDynamicWords, true);
  const chain = analyzeBashCommand("git status && git diff");
  assert.equal(chain.commands.length, 2);
  assert.deepEqual(
    chain.commands.map((c) => c.operatorBefore ?? null),
    [null, "&&"],
  );
});

test("B-ex-11 analyzeBashCommand flags a parse error on unterminated quotes", () => {
  assert.equal(analyzeBashCommand("echo 'abc").hasParseErrors, true);
});

test("B-ex-12 isBashCommandPermissionSafe rejects dynamic and subshell analyses", () => {
  assert.equal(isBashCommandPermissionSafe(analyzeBashCommand("ls")), true);
  assert.equal(isBashCommandPermissionSafe(analyzeBashCommand("echo $(date)")), false);
  assert.equal(isBashCommandPermissionSafe(analyzeBashCommand("(cd x && ls)")), false);
});

test("B-ex-13 evaluateBashRules allows on empty rules or an exact command match", () => {
  assert.equal(
    evaluateBashRules({
      allSubjectGroups: [[]],
      behavior: "allow",
      exactCommands: [],
      requiredSubjectGroups: [[]],
      rules: [{ ruleContent: "", ruleBehavior: "allow" }],
      safe: false,
    }),
    true,
  );
  assert.equal(
    evaluateBashRules({
      allSubjectGroups: [["ls"]],
      behavior: "allow",
      exactCommands: ["ls -la"],
      requiredSubjectGroups: [["ls"]],
      rules: [{ ruleContent: "ls -la", ruleBehavior: "allow" }],
      safe: false,
    }),
    true,
  );
});

test("B-ex-14 evaluateBashRules honours deny rules and safe prefix matching", () => {
  assert.equal(
    evaluateBashRules({
      allSubjectGroups: [["rm"]],
      behavior: "deny",
      exactCommands: [],
      requiredSubjectGroups: [["rm"]],
      rules: [{ ruleContent: "rm", ruleBehavior: "deny" }],
      safe: false,
    }),
    false,
  );
  assert.equal(
    evaluateBashRules({
      allSubjectGroups: [["git status"]],
      behavior: "allow",
      exactCommands: [],
      requiredSubjectGroups: [["git status"]],
      rules: [{ ruleContent: "git:*", ruleBehavior: "allow" }],
      safe: true,
    }),
    true,
  );
});

test("B-ex-15 decideBashCwdPolicy drops the decision unless a main-scope completed run moved the cwd", () => {
  const base = {
    exitCode: 0,
    resolvedCwd: "/ws",
    workspaceRoot: "/ws",
    platform: "linux",
  } as const;
  assert.deepEqual(decideBashCwdPolicy({ ...base, status: "timed_out" }), {});
  assert.deepEqual(decideBashCwdPolicy({ ...base, status: "completed", exitCode: 1 }), {});
  assert.deepEqual(
    decideBashCwdPolicy({ ...base, status: "completed", runtimeScope: "subagent" }),
    {},
  );
  assert.deepEqual(
    decideBashCwdPolicy({
      status: "completed",
      exitCode: 0,
      resolvedCwd: undefined,
      workspaceRoot: "/ws",
      platform: "linux",
    }),
    {},
  );
});

test("B-ex-16 decideBashCwdPolicy keeps an in-workspace cwd and resets an escaping one", () => {
  const kept = decideBashCwdPolicy({
    status: "completed",
    exitCode: 0,
    resolvedCwd: "/ws",
    workspaceRoot: "/ws",
    platform: "linux",
  });
  assert.equal(kept.stderrSuffix, undefined);
  assert.ok(kept.nextWorkingDirectory);

  const reset = decideBashCwdPolicy({
    status: "completed",
    exitCode: 0,
    resolvedCwd: "/outside/dir",
    workspaceRoot: "/ws",
    platform: "linux",
  });
  assert.ok(reset.nextWorkingDirectory);
  assert.match(reset.stderrSuffix ?? "", /^Shell cwd was reset to /);
});

test("B-ex-17 appendBashCwdStderrSuffix joins, replaces empty stderr and no-ops", () => {
  assert.equal(appendBashCwdStderrSuffix("warn\n", "suffix"), "warn\nsuffix");
  assert.equal(appendBashCwdStderrSuffix("", "suffix"), "suffix");
  assert.equal(appendBashCwdStderrSuffix("warn", undefined), "warn");
});

test("B-ex-18 analysisContainsGitCommand recognizes git incl. command wrappers", () => {
  assert.equal(analysisContainsGitCommand([{ name: "git", argv: ["git", "status"] }]), true);
  assert.equal(
    analysisContainsGitCommand([{ name: "command", argv: ["command", "git", "status"] }]),
    true,
  );
  assert.equal(analysisContainsGitCommand([{ name: "ls", argv: ["ls"] }]), false);
});

test("B-ex-19 analysisContainsGitAndDirectoryChange requires both git and a cd", () => {
  assert.equal(
    analysisContainsGitAndDirectoryChange([
      { name: "git", argv: ["git", "status"] },
      { name: "cd", argv: ["cd", "x"] },
    ]),
    true,
  );
  assert.equal(
    analysisContainsGitAndDirectoryChange([{ name: "git", argv: ["git", "status"] }]),
    false,
  );
  assert.equal(
    analysisContainsGitAndDirectoryChange([
      { name: "cd", argv: ["cd", "x"] },
      { name: "grep", argv: ["grep", "foo"] },
    ]),
    false,
  );
});

test("B-ex-20 isGitRuntimeContextUnsafe keys off a resolvable working directory", () => {
  assert.equal(isGitRuntimeContextUnsafe(undefined), false);
  assert.equal(isGitRuntimeContextUnsafe({}), false);
  assert.equal(isGitRuntimeContextUnsafe({ workingDirectory: "Z:\\nonexistent-zzz" }), true);
});

test("B-ex-21 getGhRateLimitHint fires once per cooldown and only for gh rate-limit output", () => {
  // Stateful cooldown: the first qualifying call emits the hint, an immediate repeat is suppressed.
  const hint = getGhRateLimitHint("gh pr list", "API rate limit exceeded");
  assert.ok(hint);
  assert.match(hint ?? "", /rate limit/i);
  assert.equal(getGhRateLimitHint("gh pr list", "API rate limit exceeded"), undefined);
  assert.equal(getGhRateLimitHint("ls", "API rate limit exceeded"), undefined);
  assert.equal(getGhRateLimitHint("gh pr list", "some other output"), undefined);
});
