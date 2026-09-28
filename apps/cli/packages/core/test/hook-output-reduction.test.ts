// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionRequestHookDecision } from "@knorvia/contracts";
import { mergeHookRunResult, processHookOutput } from "../src/hooks/output.js";
import type { HookRunResult } from "../src/hooks/types.js";

function fold(...items: HookRunResult[]) {
  const result: HookRunResult = { additionalContexts: [] };
  for (const item of items) mergeHookRunResult(result, item);
  return result;
}
function pre(behavior: "allow" | "ask" | "deny", reason?: string): HookRunResult {
  return processHookOutput("PreToolUse", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: behavior,
      permissionDecisionReason: reason,
    },
  });
}
function structured(decision: PermissionRequestHookDecision): HookRunResult {
  return processHookOutput("PermissionRequest", {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision },
  });
}

test("structured denial survives subsequent allows and modifications without freezing context", () => {
  const deny = { behavior: "deny" as const, message: "blocked" };
  for (const input of [undefined, null, { changed: true }]) {
    const result = fold(structured(deny), {
      ...structured({ behavior: "allow", updatedInput: input }),
      additionalContexts: ["later"],
    });
    assert.equal(result.permissionRequestResult, deny);
    assert.deepEqual(result.additionalContexts, ["later"]);
  }
});

test("same priority structured decisions keep the last entire original object", () => {
  for (const decision of [
    { behavior: "deny" as const },
    { behavior: "deny" as const, message: "" },
    { behavior: "deny" as const, message: "new" },
    { behavior: "allow" as const, updatedInput: null, permissionUpdates: [] },
  ]) {
    const old: PermissionRequestHookDecision =
      decision.behavior === "deny"
        ? { behavior: "deny", message: "old" }
        : { behavior: "allow", updatedInput: "old" };
    assert.equal(fold(structured(old), structured(decision)).permissionRequestResult, decision);
    assert.equal(
      fold(structured({ behavior: "allow" }), structured(decision)).permissionRequestResult,
      decision,
    );
  }
});

test("weaker Pre decisions cannot replace the winning permission reason", () => {
  for (const [first, second] of [
    ["deny", "ask"],
    ["deny", "allow"],
    ["ask", "allow"],
  ] as const) {
    const result = fold(pre(first, "WINNER"), pre(second, "WEAKER"));
    assert.equal(result.permissionBehavior, first);
    assert.equal(result.hookPermissionDecisionReason, "WINNER");
  }
});

test("stronger Pre decisions without a reason clear weaker explanations", () => {
  for (const [first, second] of [
    ["allow", "ask"],
    ["allow", "deny"],
    ["ask", "deny"],
  ] as const) {
    const result = fold(pre(first, "WEAKER"), pre(second));
    assert.equal(result.permissionBehavior, second);
    assert.equal(result.hookPermissionDecisionReason, undefined);
  }
});

test("equal priority reasons keep absence but accept an explicit empty string", () => {
  for (const behavior of ["allow", "ask", "deny"] as const) {
    assert.equal(fold(pre(behavior, "old"), pre(behavior)).hookPermissionDecisionReason, "old");
    assert.equal(
      fold(pre(behavior, "old"), pre(behavior, "new")).hookPermissionDecisionReason,
      "new",
    );
    assert.equal(fold(pre(behavior, "old"), pre(behavior, "")).hookPermissionDecisionReason, "");
  }
});

test("legacy blocking reasons displace weaker reasons and cannot be displaced by allow", () => {
  const blocked = processHookOutput("PreToolUse", { decision: "block", reason: "BLOCK" });
  const result = fold(pre("ask", "ASK"), blocked, pre("allow", "ALLOW"));
  assert.equal(result.permissionBehavior, "deny");
  assert.equal(result.hookPermissionDecisionReason ?? result.stopReason, "BLOCK");
});

test("sticky stops preserve own undefined overwrite and explicit false continuation", () => {
  const result = fold(
    { additionalContexts: ["a"], blockRequested: true, stopReason: "first" },
    { additionalContexts: ["a"], preventContinuation: true },
  );
  assert.equal(result.blockRequested, true);
  assert.equal(result.preventContinuation, true);
  assert.ok(Object.hasOwn(result, "stopReason"));
  assert.equal(result.stopReason, undefined);
  mergeHookRunResult(result, {
    additionalContexts: [],
    blockRequested: false,
    preventContinuation: false,
    stopShouldContinue: false,
    stopReason: "last",
  });
  assert.equal(result.blockRequested, true);
  assert.equal(result.preventContinuation, true);
  assert.equal(result.stopShouldContinue, false);
  assert.equal(result.stopReason, "last");
  assert.deepEqual(result.additionalContexts, ["a", "a"]);
});

test("input merges retain references, accept null and skip undefined without mutating the next result", () => {
  const input = { shared: true };
  const next: HookRunResult = { additionalContexts: ["context"], updatedInput: input };
  const result = fold(next);
  assert.equal(result.updatedInput, input);
  assert.notEqual(result.additionalContexts, next.additionalContexts);
  mergeHookRunResult(result, { additionalContexts: [], updatedInput: undefined });
  assert.equal(result.updatedInput, input);
  mergeHookRunResult(result, { additionalContexts: [], updatedInput: null });
  assert.equal(result.updatedInput, null);
  assert.deepEqual(next, { additionalContexts: ["context"], updatedInput: input });
});

test("structured merge selects the value read after its presence probe", () => {
  const first: PermissionRequestHookDecision = { behavior: "deny", message: "first read" };
  const second: PermissionRequestHookDecision = { behavior: "allow" };
  let reads = 0;
  const result = fold({
    additionalContexts: [],
    get permissionRequestResult() {
      return ++reads === 1 ? first : second;
    },
  });
  assert.equal(result.permissionRequestResult, second);
  assert.equal(reads, 2);
});

test("reason callbacks run before the live permission behavior is selected", () => {
  let behavior: HookRunResult["permissionBehavior"] = "allow";
  const trace: string[] = [];
  const result = fold({
    additionalContexts: [],
    get hookPermissionDecisionReason() {
      trace.push("reason");
      behavior = "ask";
      return "ASK";
    },
    get permissionBehavior() {
      trace.push("behavior");
      return behavior;
    },
  });
  assert.equal(result.permissionBehavior, "ask");
  assert.equal(result.hookPermissionDecisionReason, "ASK");
  assert.deepEqual(trace, ["reason", "reason", "behavior", "behavior"]);
});

test("a behavior that disappears after its presence probe retains the already read reason", () => {
  let reads = 0;
  const result = fold({
    additionalContexts: [],
    hookPermissionDecisionReason: "R",
    get permissionBehavior(): HookRunResult["permissionBehavior"] {
      return ++reads === 1 ? "allow" : undefined;
    },
  });
  assert.deepEqual(result, {
    additionalContexts: [],
    hookPermissionDecisionReason: "R",
    permissionBehavior: undefined,
  });
  assert.ok(Object.hasOwn(result, "permissionBehavior"));
});

test("a reason that disappears after its presence probe retains own undefined", () => {
  let reads = 0;
  const result = fold({
    additionalContexts: [],
    permissionBehavior: "allow",
    get hookPermissionDecisionReason() {
      return ++reads === 1 ? "R" : undefined;
    },
  });
  assert.deepEqual(result, {
    additionalContexts: [],
    hookPermissionDecisionReason: undefined,
    permissionBehavior: "allow",
  });
  assert.ok(Object.hasOwn(result, "hookPermissionDecisionReason"));
});
