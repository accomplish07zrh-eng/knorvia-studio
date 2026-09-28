// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, createCoreError, isCoreError, type Logger } from "@knorvia/contracts";
import {
  createHookCancelledError,
  createHookTimeoutError,
  linkAbortSignal,
  matchesAnyHookMatcher,
  readHookErrorMessage,
  resolveHookDescriptor,
  resolveHookFailureOutcome,
  resolveHookRunAdmission,
} from "../src/hooks/runner-helpers.js";
import type { HookRegistration } from "../src/hooks/types.js";
import { descriptor, runnerInput } from "./hook-runner-fixture.js";

test("runtime matcher accepts aliases, preserves no-candidate behavior and handles invalid patterns", () => {
  assert.equal(matchesAnyHookMatcher({}, "["), true);
  assert.equal(matchesAnyHookMatcher({ matchValue: "" }, "Read"), true);
  assert.equal(
    matchesAnyHookMatcher({ matchValue: "Write", matchValues: ["Read", "Read"] }, "Read"),
    true,
  );
  assert.equal(matchesAnyHookMatcher({ matchValues: [""] }, "Read"), false);
  assert.equal(matchesAnyHookMatcher({ matchValue: "Read" }, "["), false);
  assert.equal(matchesAnyHookMatcher({ matchValue: "Read" }, undefined), true);
});

test("parent abort linking forwards the original reason and unlinking never aborts the child", () => {
  const reason = { fixture: "reason" };
  const parent = new AbortController(),
    child = new AbortController();
  const unlink = linkAbortSignal(parent.signal, child);
  parent.abort(reason);
  assert.equal(child.signal.reason, reason);
  unlink();
  const existing = new AbortController();
  existing.abort("own reason");
  linkAbortSignal(parent.signal, existing)();
  assert.equal(existing.signal.reason, "own reason");
  const lateParent = new AbortController(),
    detached = new AbortController();
  linkAbortSignal(lateParent.signal, detached)();
  lateParent.abort(reason);
  assert.equal(detached.signal.aborted, false);
  linkAbortSignal(undefined, detached)();
  assert.equal(detached.signal.aborted, false);
});

test("timeout and cancellation keep their recoverable error types and stable outcomes", () => {
  const timeout = createHookTimeoutError(45),
    cancelled = createHookCancelledError();
  assert.ok(isCoreError(timeout));
  assert.ok(isCoreError(cancelled));
  assert.equal(timeout.type, CoreErrorType.ToolTimeout);
  assert.equal(timeout.recoverable, true);
  assert.equal(timeout.message, "Hook timed out after 45ms");
  assert.equal(cancelled.type, CoreErrorType.ToolCancelled);
  assert.equal(cancelled.message, "Hook execution cancelled");
  assert.equal(resolveHookFailureOutcome(timeout), "timed_out");
  assert.equal(resolveHookFailureOutcome(cancelled), "cancelled");
  assert.equal(resolveHookFailureOutcome(new Error("fixture")), "failed");
});

test("failure text prefers a nonempty core error cause and otherwise retains the outer message", () => {
  for (const text of ["cause", ""]) {
    const wrapped = createCoreError(CoreErrorType.ToolExecutionFailed, "outer", {
      cause: new Error(text),
    });
    assert.equal(readHookErrorMessage(wrapped), text || "outer");
  }
  assert.equal(readHookErrorMessage(new Error("plain")), "plain");
  assert.equal(readHookErrorMessage(7), "7");
  const failure = new Error("toString failed");
  assert.throws(
    () =>
      readHookErrorMessage({
        toString() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
});

test("descriptor resolution retains object and callback identity before applying defaults", () => {
  const value = descriptor(),
    input = runnerInput();
  const hook: HookRegistration = { event: "PreToolUse", callback: () => {}, descriptor: value };
  assert.equal(resolveHookDescriptor(hook, 500, input), value);
  hook.descriptor = function (actual) {
    assert.equal(this, hook);
    assert.equal(actual, input);
    return value;
  };
  assert.equal(resolveHookDescriptor(hook, 500, input), value);
  delete hook.descriptor;
  hook.source = "";
  hook.async = true;
  hook.timeoutMs = 0;
  assert.deepEqual(resolveHookDescriptor(hook, 500, input), {
    clientVisible: false,
    commandDisplay: "",
    executionMode: "background",
    executionType: "process",
    sourceKind: "internal",
    timeoutMs: 0,
  });
});

test("admission preserves direct results and fails closed while logger failures remain visible", () => {
  const input = runnerInput(),
    result = { allowed: true, skipLifecycle: true };
  const hook: HookRegistration = { event: "PreToolUse", callback: () => {} };
  assert.deepEqual(resolveHookRunAdmission(hook, input), { allowed: true });
  hook.admission = function (actual) {
    assert.equal(this, hook);
    assert.equal(actual, input);
    return result;
  };
  assert.equal(resolveHookRunAdmission(hook, input), result);
  const warnings: string[] = [];
  const logger: Logger = {
    debug() {},
    info() {},
    error() {},
    child() {
      return this;
    },
    warn(message) {
      assert.equal(this, logger);
      warnings.push(message);
    },
  };
  hook.admission = () => {
    throw new Error("fixture admission");
  };
  assert.deepEqual(resolveHookRunAdmission(hook, input, logger), {
    allowed: false,
    reasonCode: "workspace_hooks_blocked_untrusted",
  });
  assert.deepEqual(warnings, ["Hook admission gate failed closed"]);
  const failure = new Error("fixture logger");
  logger.warn = () => {
    throw failure;
  };
  assert.throws(
    () => resolveHookRunAdmission(hook, input, logger),
    (error) => error === failure,
  );
});
