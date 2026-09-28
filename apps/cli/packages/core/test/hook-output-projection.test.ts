// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, HookEventName, isCoreError } from "@knorvia/contracts";
import { matchesHookMatcher, processHookOutput } from "../src/hooks/output.js";

test("each Hook event keeps its continuation and legacy decision contract", () => {
  for (const event of Object.values(HookEventName)) {
    const permission = event === "PreToolUse" || event === "PermissionRequest";
    const prevents = permission || event === "UserPromptSubmit";
    const stopped = processHookOutput(event, { continue: false });
    assert.equal(stopped.blockRequested, event === "Stop" ? undefined : true);
    assert.equal(stopped.preventContinuation, prevents ? true : undefined);
    assert.equal(stopped.permissionBehavior, permission ? "deny" : undefined);
    assert.equal(Object.hasOwn(stopped, "stopReason"), event !== "Stop");
    const blocked = processHookOutput(event, { decision: "block", reason: "why" });
    assert.equal(blocked.blockRequested, true);
    assert.equal(blocked.stopReason, "why");
    assert.equal(blocked.stopShouldContinue, event === "Stop" ? true : undefined);
    assert.equal(blocked.preventContinuation, prevents ? true : undefined);
    const approved = processHookOutput(event, { decision: "approve" });
    assert.equal(approved.permissionBehavior, permission ? "allow" : undefined);
    assert.deepEqual(
      processHookOutput(event, { continue: true }),
      event === "Stop"
        ? { additionalContexts: [], stopShouldContinue: true, stopReason: undefined }
        : { additionalContexts: [] },
    );
  }
});

test("Stop feedback retains ordered repeated and whitespace contexts", () => {
  assert.deepEqual(
    processHookOutput("Stop", {
      decision: "block",
      systemMessage: "same",
      reason: "same",
      stopReason: "",
      additionalContext: " ",
      additional_context: "snake",
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: "specific" },
    }),
    {
      additionalContexts: ["same", "same", " ", "snake", "specific"],
      blockRequested: true,
      stopReason: "",
      stopShouldContinue: true,
    },
  );
  assert.deepEqual(
    processHookOutput("Stop", {
      additionalContext: "",
      additional_context: "",
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: "" },
    }),
    { additionalContexts: [] },
  );
});

test("specific fields preserve references, null inputs and own undefined reasons", () => {
  for (const input of [null, false, 0, "", { value: "fixture" }, undefined]) {
    const result = processHookOutput("PreToolUse", {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        updatedInput: input,
      },
    });
    assert.equal(result.updatedInput, input);
    assert.equal(Object.hasOwn(result, "updatedInput"), input !== undefined);
    assert.ok(Object.hasOwn(result, "hookPermissionDecisionReason"));
  }
  const decision = { behavior: "allow" as const, updatedInput: { shared: true } };
  const result = processHookOutput("PermissionRequest", {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision },
  });
  assert.equal(result.permissionRequestResult, decision);
  assert.equal(Object.hasOwn(result, "updatedInput"), false);
});

test("all contextual specific events append after legacy context aliases", () => {
  for (const event of Object.values(HookEventName)) {
    if (event === "PermissionRequest") continue;
    assert.deepEqual(
      processHookOutput(event, {
        additionalContext: "camel",
        additional_context: "snake",
        hookSpecificOutput: { hookEventName: event, additionalContext: "specific" },
      }),
      { additionalContexts: ["camel", "snake", "specific"] },
    );
  }
});

test("wrong event throws a recoverable contract error after legacy fields are read", () => {
  const reads: string[] = [];
  assert.throws(
    () =>
      processHookOutput("PreToolUse", {
        get additionalContext() {
          reads.push("context");
          return "temporary";
        },
        hookSpecificOutput: { hookEventName: "Stop", additionalContext: "discarded" },
      }),
    (error: unknown) => {
      assert.ok(isCoreError(error));
      assert.equal(error.type, CoreErrorType.ToolExecutionFailed);
      assert.equal(error.message, "Hook returned wrong event name");
      assert.equal(error.recoverable, true);
      assert.deepEqual(error.context, { expectedEvent: "PreToolUse", hookEventName: "Stop" });
      return true;
    },
  );
  assert.deepEqual(reads, ["context", "context"]);
});

test("a Pre stop cannot report a weaker specific reason as the denial reason", () => {
  for (const stop of [{ continue: false }, { decision: "block" as const }])
    for (const behavior of ["allow", "ask"] as const) {
      const result = processHookOutput("PreToolUse", {
        ...stop,
        reason: "STOP",
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: behavior,
          permissionDecisionReason: "WEAKER",
        },
      });
      assert.equal(result.permissionBehavior, "deny");
      assert.equal(result.preventContinuation, true);
      assert.equal(result.hookPermissionDecisionReason ?? result.stopReason, "STOP");
    }
});

test("a Pre stop still accepts the specific deny reason, including an empty string", () => {
  for (const reason of ["DENY", "", undefined]) {
    const result = processHookOutput("PreToolUse", {
      decision: "block",
      reason: "STOP",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    });
    assert.equal(result.hookPermissionDecisionReason, reason);
    assert.equal(result.hookPermissionDecisionReason ?? result.stopReason, reason ?? "STOP");
  }
});

test("matcher distinguishes literal alternatives from regular expressions", () => {
  const cases: [string | undefined, string | undefined, boolean][] = [
    [undefined, undefined, true],
    ["", "", true],
    [undefined, "*", true],
    [undefined, "Read", false],
    ["", "|Read", false],
    ["read", "Read|Write", false],
    ["Read", "Read|Write", true],
    ["prefixRead", "Read|Write", false],
    ["Read_1", "Read_1|2", true],
    ["ReadX", "^Read.+$", true],
    ["Read", "^Read.+$", false],
    ["Read", "[", false],
    ["工具", "工具", true],
    ["anything", "||", false],
    ["b", "a|b", true],
    ["a\nb", "^a.b$", false],
  ];
  for (const [value, matcher, expected] of cases)
    assert.equal(matchesHookMatcher(value, matcher), expected, JSON.stringify([value, matcher]));
});

test("empty outputs allocate independent results and ignored fields have no effects", () => {
  const a = processHookOutput("SessionStart", undefined);
  const b = processHookOutput("SessionStart", { suppressOutput: true, systemMessage: "ignored" });
  assert.deepEqual(a, b);
  assert.notEqual(a.additionalContexts, b.additionalContexts);
});

test("specific dispatch reads the event once after the separate entry validation", () => {
  let reads = 0;
  const failure = new Error("unexpected third event read");
  const result = processHookOutput("PreToolUse", {
    hookSpecificOutput: {
      get hookEventName(): "PreToolUse" {
        if (++reads > 2) throw failure;
        return "PreToolUse";
      },
      permissionDecision: "deny",
      permissionDecisionReason: "DENY",
    },
  });
  assert.equal(reads, 2);
  assert.equal(result.permissionBehavior, "deny");
});

test("contradictory Pre legacy approve cannot weaken continue false", () => {
  assert.deepEqual(
    processHookOutput("PreToolUse", {
      continue: false,
      decision: "approve",
      reason: "STOP",
    }),
    {
      additionalContexts: [],
      blockRequested: true,
      stopReason: "STOP",
      preventContinuation: true,
      permissionBehavior: "deny",
    },
  );
});
