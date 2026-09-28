// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createCoreError, CoreErrorType, HookEventName } from "@knorvia/contracts";
import {
  runPreToolUseHooks,
  runPermissionRequestHooks,
  runPostToolUseHooks,
  runPostToolUseFailureHooks,
} from "../src/tool/executor/hook-flow.js";
import { permissionFlow } from "./permission-flow-fixture.js";

test("Hook dispatch captures its runner and method before context callbacks can replace them", async () => {
  for (const phase of ["before", "approval", "after", "failure"] as const) {
    const f = permissionFlow();
    const original = { additionalContexts: ["original"], permissionBehavior: "deny" as const };
    const replacement = async () => ({
      additionalContexts: ["replacement"],
      permissionBehavior: "allow" as const,
    });
    const runner = {
      async run() {
        assert.equal(this, runner);
        return original;
      },
    };
    f.deps.hookRunner = runner;
    f.deps.getWorkingDirectory = () => {
      Object.assign(runner, { run: replacement });
      f.deps.hookRunner = { run: replacement };
      return ".";
    };
    const result =
      phase === "before"
        ? await runPreToolUseHooks(f.deps, f.call, {}, f.entry, "build", f.trace)
        : phase === "approval"
          ? await runPermissionRequestHooks(
              f.deps,
              f.call,
              {},
              "fixture",
              f.state.decision,
              "build",
              f.trace,
            )
          : phase === "after"
            ? await runPostToolUseHooks(f.deps, f.call, {}, {}, undefined, f.trace)
            : await runPostToolUseFailureHooks(f.deps, f.call, {}, new Error("fixture"), f.trace);
    assert.deepEqual(
      result,
      phase === "approval"
        ? { decision: "deny", reason: "Denied by PermissionRequest hook" }
        : original,
    );
  }
});

test("Failure normalizes a thrown value before capturing the runner", async () => {
  const f = permissionFlow();
  const replacementResult = { additionalContexts: ["normalized target"] };
  const error = {
    toString() {
      f.deps.hookRunner = { run: async () => replacementResult };
      return "fixture";
    },
  };
  assert.equal(
    await runPostToolUseFailureHooks(f.deps, f.call, {}, error, f.trace),
    replacementResult,
  );
});

test("missing runner is lazy and returns independent empty results", async () => {
  const f = permissionFlow();
  f.deps.hookRunner = undefined;
  f.deps.getWorkingDirectory = f.deps.getMode = () => {
    throw new Error("must not read");
  };
  const explosive = {
    toString() {
      throw new Error("must not convert");
    },
  };
  const pre = () => runPreToolUseHooks(f.deps, f.call, {}, f.entry, "build", f.trace);
  const first = await pre(),
    second = await pre();
  assert.deepEqual(first, { additionalContexts: [] });
  assert.notEqual(first.additionalContexts, second.additionalContexts);
  assert.equal(
    await runPermissionRequestHooks(f.deps, f.call, {}, "p", f.state.decision, "build", f.trace),
    undefined,
  );
  assert.deepEqual(
    await runPostToolUseHooks(f.deps, f.call, {}, explosive, undefined, f.trace),
    first,
  );
  assert.deepEqual(await runPostToolUseFailureHooks(f.deps, f.call, {}, explosive, f.trace), first);
});

test("Pre and PermissionRequest project identity, modes, aliases and original references", async () => {
  const f = permissionFlow();
  f.call.name = "ApplyPatch";
  f.trace.turnId = "" as typeof f.trace.turnId;
  f.deps.getMode = () => {
    throw new Error("explicit mode only");
  };
  const runner = f.deps.hookRunner!;
  const run = runner.run;
  runner.run = function (...args) {
    assert.equal(this, runner);
    return run.apply(this, args);
  };
  const input = { patch: "fixture" };
  const before = Date.now();
  await runPreToolUseHooks(f.deps, f.call, input, f.entry, "plan", f.trace, f.controller.signal);
  await runPermissionRequestHooks(
    f.deps,
    f.call,
    input,
    "fixture-request",
    { ...f.state.decision, reason: "" },
    "auto",
    f.trace,
    f.controller.signal,
  );
  for (const [index, observed] of f.observed.hooks.entries()) {
    assert.ok(
      observed.input.hookEventName === HookEventName.PreToolUse ||
        observed.input.hookEventName === HookEventName.PermissionRequest,
    );
    assert.equal(observed.input.toolInput, input);
    assert.equal(observed.input.toolCallId, f.call.id);
    assert.equal(observed.input.mode, index === 0 ? "plan" : "auto");
    assert.equal(observed.input.turnId, "");
    assert.equal(observed.input.traceId, f.trace.traceId);
    assert.equal(observed.options?.signal, f.controller.signal);
    assert.deepEqual(observed.options?.matchValues, ["ApplyPatch", "Write", "Edit"]);
    assert.equal(observed.options?.matchValue, "ApplyPatch");
    const time = Date.parse(observed.input.timestamp);
    assert.ok(time >= before && time <= Date.now());
  }
  const request = f.observed.hooks[1]!.input;
  assert.equal(request.hookEventName, HookEventName.PermissionRequest);
  if (request.hookEventName === HookEventName.PermissionRequest) {
    assert.equal(request.reason, "");
    assert.equal(request.requestId, "fixture-request");
  }
});

test("Post reads current mode after cwd and preserves output, artifact and preview limits", async () => {
  const f = permissionFlow();
  f.deps.getWorkingDirectory = () => {
    f.timeline.push("cwd");
    return ".";
  };
  f.deps.getMode = () => {
    f.timeline.push("mode");
    return "auto";
  };
  const outputs: unknown[] = ["x".repeat(4001), { value: 1 }, undefined];
  for (const [index, output] of outputs.entries()) {
    await runPostToolUseHooks(
      f.deps,
      f.call,
      f.call.input,
      output,
      index ? "" : "fixture.json",
      f.trace,
    );
    const record = f.observed.hooks[index]!.input;
    assert.equal(record.hookEventName, HookEventName.PostToolUse);
    if (record.hookEventName !== HookEventName.PostToolUse) assert.fail("wrong phase");
    assert.equal(record.toolResponse, output);
    assert.deepEqual(record.artifactRefs, index ? undefined : ["fixture.json"]);
    assert.ok(Object.hasOwn(record, "artifactRefs"));
    assert.equal(
      record.toolResultPreview,
      index === 0 ? `${"x".repeat(4000)}...[truncated]` : index === 1 ? '{"value":1}' : "",
    );
    assert.equal(record.mode, "auto");
    assert.equal(record.turnId, f.deps.turnId);
  }
  assert.deepEqual(f.timeline.slice(0, 3), ["cwd", "mode", HookEventName.PostToolUse]);
});

test("Failure normalizes errors and preserves cancellation type without swallowing runner errors", async () => {
  const f = permissionFlow();
  const errors = [
    new Error("ordinary"),
    "plain",
    createCoreError(CoreErrorType.ToolCancelled, "cancelled"),
  ];
  for (const [index, error] of errors.entries()) {
    await runPostToolUseFailureHooks(f.deps, f.call, f.call.input, error, f.trace);
    const record = f.observed.hooks[index]!.input;
    if (record.hookEventName !== HookEventName.PostToolUseFailure) assert.fail("wrong phase");
    assert.deepEqual(record.error, {
      message: index === 0 ? "ordinary" : index === 1 ? "plain" : "cancelled",
      type: index === 2 ? CoreErrorType.ToolCancelled : "Error",
    });
    assert.equal(record.isInterrupt, index === 2);
  }
  const failure = { reason: "hook port failed" };
  f.behavior.hook = async () => {
    throw failure;
  };
  await assert.rejects(
    runPreToolUseHooks(f.deps, f.call, {}, f.entry, "build", f.trace),
    (e) => e === failure,
  );
  await assert.rejects(
    runPostToolUseFailureHooks(f.deps, f.call, {}, errors[0], f.trace),
    (e) => e === failure,
  );
});
