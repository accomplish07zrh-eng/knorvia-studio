// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { HookRunResult } from "../src/hooks/index.js";
import {
  applyPreToolPermissionDecision,
  formatHookAdditionalContexts,
  runPermissionRequestHooks,
} from "../src/tool/executor/hook-flow.js";
import { permissionFlow } from "./permission-flow-fixture.js";
import { grantUpdate } from "./permission-grant-fixture.js";

test("legacy Hook projection retains ordered live behavior reads", async () => {
  const f = permissionFlow();
  let reads = 0;
  f.behavior.hook = async () => ({
    additionalContexts: [],
    get permissionBehavior(): HookRunResult["permissionBehavior"] {
      return ++reads === 1 ? "ask" : "allow";
    },
  });
  assert.deepEqual(
    await runPermissionRequestHooks(
      f.deps,
      f.call,
      {},
      "fixture",
      f.state.decision,
      "build",
      f.trace,
    ),
    {
      decision: "allow",
      reason: "Allowed by PermissionRequest hook",
    },
  );
  assert.equal(reads, 2);
});

test("Pre transition eligibility observes the decision after reading Hook behavior", () => {
  const f = permissionFlow();
  const hook: HookRunResult = {
    additionalContexts: [],
    get permissionBehavior(): HookRunResult["permissionBehavior"] {
      f.state.decision.decision = "deny";
      return "allow";
    },
  };
  assert.equal(applyPreToolPermissionDecision(f.state.decision, hook, "build"), f.state.decision);
  assert.equal(f.state.decision.decision, "deny");
});

test("context formatting snapshots length before entries can append content", () => {
  const contexts = ["first"];
  Object.defineProperty(contexts, 0, {
    get() {
      contexts.push("late");
      return "first";
    },
  });
  assert.equal(formatHookAdditionalContexts(contexts), "[Hook additional context]\n#1\nfirst");
  assert.equal(contexts.length, 2);
});

test("PermissionRequest stop dominates structured replies while empty reasons survive", async () => {
  const f = permissionFlow();
  const result: HookRunResult = {
    additionalContexts: [],
    preventContinuation: true,
    stopReason: "",
    permissionRequestResult: { behavior: "allow", updatedInput: null },
  };
  f.behavior.hook = async () => result;
  const run = () =>
    runPermissionRequestHooks(f.deps, f.call, {}, "fixture", f.state.decision, "build", f.trace);
  assert.deepEqual(await run(), { decision: "deny", reason: "" });
  result.stopReason = undefined;
  assert.deepEqual(await run(), { decision: "deny", reason: "Denied by PermissionRequest hook" });
  result.preventContinuation = false;
  result.permissionRequestResult = { behavior: "deny", message: "" };
  assert.deepEqual(await run(), { decision: "deny", reason: "" });
});

test("legacy Hook decisions abstain or reply without inventing updates", async () => {
  const f = permissionFlow();
  for (const behavior of [undefined, "ask", "allow", "deny"] as const) {
    f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: behavior });
    const actual = await runPermissionRequestHooks(
      f.deps,
      f.call,
      {},
      "fixture",
      f.state.decision,
      "build",
      f.trace,
    );
    assert.deepEqual(
      actual,
      behavior === "allow"
        ? { decision: "allow", reason: "Allowed by PermissionRequest hook" }
        : behavior === "deny"
          ? { decision: "deny", reason: "Denied by PermissionRequest hook" }
          : undefined,
    );
  }
});

test("structured replies prefer current updates and null input still means modify", async () => {
  const f = permissionFlow();
  const current = grantUpdate("Current"),
    legacy = grantUpdate("Legacy");
  for (const updatedInput of [undefined, null, false, 0, "", { value: "changed" }]) {
    f.behavior.hook = async () => ({
      additionalContexts: [],
      permissionBehavior: "deny",
      permissionRequestResult: {
        behavior: "allow",
        updatedInput,
        permissionUpdates: current,
        updatedPermissions: legacy,
      },
    });
    const reply = await runPermissionRequestHooks(
      f.deps,
      f.call,
      {},
      "fixture",
      f.state.decision,
      "build",
      f.trace,
    );
    assert.equal(reply?.decision, updatedInput === undefined ? "allow" : "modify");
    assert.equal(reply?.permissionUpdates, current);
    if (reply?.decision === "modify") assert.equal(reply.modifiedInput, updatedInput);
  }
  for (const updates of [legacy, undefined]) {
    f.behavior.hook = async () => ({
      additionalContexts: [],
      permissionRequestResult: { behavior: "allow", updatedPermissions: updates },
    });
    const reply = await runPermissionRequestHooks(
      f.deps,
      f.call,
      {},
      "fixture",
      f.state.decision,
      "build",
      f.trace,
    );
    assert.equal(reply?.permissionUpdates, updates);
    assert.ok(Object.hasOwn(reply!, "permissionUpdates"));
  }
});

test("Pre decisions preserve denials and mandatory prompts; only valid transitions copy", () => {
  const f = permissionFlow();
  for (const decision of ["allow", "ask", "deny"] as const)
    for (const alwaysAsk of [false, true])
      for (const behavior of [undefined, "allow", "ask", "deny"] as const) {
        const original = { ...f.state.decision, decision, alwaysAsk };
        const result = applyPreToolPermissionDecision(
          original,
          {
            additionalContexts: [],
            permissionBehavior: behavior,
            hookPermissionDecisionReason: "",
          },
          "plan",
        );
        const allowed = decision === "ask" && !alwaysAsk && behavior === "allow";
        const asked = decision === "allow" && behavior === "ask";
        if (!allowed && !asked) {
          assert.equal(result, original);
          continue;
        }
        assert.notEqual(result, original);
        assert.equal(result.decision, allowed ? "allow" : "ask");
        assert.equal(result.allowed, allowed);
        assert.equal(result.escalated, asked);
        assert.equal(result.reason, "");
        assert.equal(result.mode, "plan");
        assert.equal(result.riskLevel, original.riskLevel);
      }
});

test("additional context formatting preserves empty, multiline and sparse entries", () => {
  assert.equal(formatHookAdditionalContexts([]), "[Hook additional context]");
  assert.equal(
    formatHookAdditionalContexts(["", "line\ntwo"]),
    "[Hook additional context]\n#1\n\n#2\nline\ntwo",
  );
  const sparse: string[] = [];
  sparse[1] = "second";
  assert.equal(formatHookAdditionalContexts(sparse), "[Hook additional context]\n\n#2\nsecond");
});
