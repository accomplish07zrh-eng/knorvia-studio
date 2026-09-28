// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  HookEventName,
  SessionEventType,
  createCoreError,
} from "@knorvia/contracts";
import { failure, invocation, eventPayload } from "./tool-invocation-fixture.js";

test("unknown and blank names emit a paired error while telemetry uses a fixed name", async () => {
  for (const name of ["unregistered private string", " \t "]) {
    const f = invocation();
    f.call.name = name;
    const result = await f.run();
    assert.equal(result.error?.type, CoreErrorType.ToolNotFound);
    assert.equal(result.toolName, name);
    assert.deepEqual(f.timeline, [SessionEventType.ToolCallError]);
    assert.deepEqual(f.observed.registered, ["unknown"]);
    assert.deepEqual(f.observed.lookups, name.trim() ? [name, name] : []);
    assert.equal(f.terminal()[0]?.args[0], "lookup");
    if (!name.trim())
      assert.equal(
        result.modelContent,
        `<tool_use_error>Error: No such tool available: ${name}</tool_use_error>`,
      );
  }
});

test("alias canonicalization, final capability and Started precede handler side effects", async () => {
  const f = invocation();
  f.call.name = "alias";
  f.entry.resolvePermissionCapability = (input) => {
    assert.equal(input, f.call.input);
    // 本例验证 workspace 事件早于 handler；运行时嵌套声明须覆盖夹具静态的 none。
    return {
      readOnly: false,
      sideEffectScope: "workspace",
      permission: { sideEffectScope: "workspace" },
    };
  };
  f.behavior.handler = async (_input, context) => {
    assert.equal(eventPayload(f.events[0]!).readOnly, false);
    assert.equal(eventPayload(f.events[0]!).sideEffectScope, "workspace");
    assert.deepEqual(context.providerVisibleToolNames, ["Fixture"]);
    return { done: true };
  };
  const result = await f.run();
  assert.equal(result.toolName, "Fixture");
  assert.deepEqual(f.observed.lookups, ["alias", "alias"]);
  assert.deepEqual(f.observed.registered, ["Fixture"]);
  assert.deepEqual(f.timeline, [
    HookEventName.PreToolUse,
    "permission",
    SessionEventType.ToolCallStarted,
    "handler",
    HookEventName.PostToolUse,
    SessionEventType.ToolCallResult,
    "background",
  ]);
});

test("an already cancelled call reads mode but never prepares input or emits lifecycle events", async () => {
  const f = invocation();
  const controller = new AbortController();
  controller.abort();
  f.deps.getMode = () => {
    f.timeline.push("mode");
    return "build";
  };
  f.entry.validateInput = () => {
    throw new Error("must not validate");
  };
  const result = await f.run({ signal: controller.signal });
  assert.equal(result.error?.type, CoreErrorType.ToolCancelled);
  assert.deepEqual(f.timeline, ["mode"]);
  assert.equal(f.terminal()[0]?.name, "finishCancelled");
});

test("schema, semantic and resolver business failures stop before Hook and approval", async () => {
  for (const kind of ["schema", "semantic", "resolver"]) {
    const f = invocation();
    if (kind === "schema") f.call.input = {};
    if (kind === "semantic") f.entry.validateInput = () => failure;
    if (kind === "resolver") f.entry.resolveInput = () => failure;
    const result = await f.run();
    assert.equal(result.success, false);
    assert.deepEqual(f.timeline, [SessionEventType.ToolCallError]);
    assert.deepEqual(f.terminal()[0]?.args.slice(0, 2), ["validation", "parse"]);
  }
});

test("input has one ordered preparation path; entry methods retain their receiver", async () => {
  const f = invocation();
  const resolved = { value: "resolved" };
  const hooked = { value: "hooked" };
  const approved = { value: "approved" };
  let validations = 0;
  let resolutions = 0;
  f.entry.validateInput = function (input) {
    assert.equal(this, f.entry);
    assert.equal(input, f.call.input);
    validations++;
    return { result: true };
  };
  f.entry.resolveInput = function (input, context) {
    assert.equal(this, f.entry);
    assert.equal(input, f.call.input);
    resolutions++;
    assert.equal(context.sessionId, f.deps.sessionId);
    assert.equal(Object.hasOwn(context, "modelCatalogPort"), false);
    return { result: true, input: resolved };
  };
  f.behavior.hook = async (input) => {
    if (input.hookEventName === HookEventName.PreToolUse) {
      assert.equal(input.toolInput, resolved);
      return { additionalContexts: ["pre"], updatedInput: hooked };
    }
    return { additionalContexts: [] };
  };
  f.behavior.decision = "ask";
  f.behavior.reply = { decision: "modify", modifiedInput: approved };
  const result = await f.run();
  assert.equal(result.success, true);
  assert.equal(f.observed.inputs[0], approved);
  assert.equal(
    eventPayload(f.events.find((e) => e.type === SessionEventType.PermissionRequested)!).input,
    hooked,
  );
  assert.equal(validations, 1);
  assert.equal(resolutions, 1);
});

test("Pre Hook denial and invalid rewrite preserve context without inventing Error events", async () => {
  for (const kind of ["deny", "stop", "invalid"]) {
    const f = invocation();
    f.behavior.hook = async () => ({
      additionalContexts: ["explanation"],
      ...(kind === "deny"
        ? {
            permissionBehavior: "deny" as const,
            hookPermissionDecisionReason: "primary",
            stopReason: "secondary",
          }
        : kind === "stop"
          ? { preventContinuation: true, stopReason: "secondary" }
          : { updatedInput: {} }),
    });
    const result = await f.run();
    assert.equal(result.success, false);
    assert.match(String(result.modelContent), /explanation/);
    assert.deepEqual(f.timeline, [HookEventName.PreToolUse]);
    if (kind === "deny") assert.match(result.error!.message, /primary/);
    assert.equal(f.terminal()[0]?.args[0], kind === "invalid" ? "validation" : "policy_denied");
  }
});

test("permission denial and escalation preserve their separate telemetry categories", async () => {
  for (const kind of ["policy", "deny", "escalate"]) {
    const f = invocation();
    f.behavior.decision = kind === "policy" ? "deny" : "ask";
    f.behavior.reply = { decision: kind === "escalate" ? "escalate" : "deny", reason: "not now" };
    const result = await f.run();
    assert.equal(result.success, false);
    assert.equal(
      f.events.some(
        (e) =>
          e.type === SessionEventType.ToolCallError || e.type === SessionEventType.ToolCallStarted,
      ),
      false,
    );
    assert.equal(f.terminal()[0]?.args[0], kind === "escalate" ? "permission" : "user_denied");
    if (kind === "escalate") assert.equal(f.terminal()[0]?.args[1], "permission");
  }
});

test("validation, resolver, Pre Hook and Started infrastructure errors escape outside execution catch", async () => {
  for (const point of ["validation", "resolver", "pre", "started", "timeout"]) {
    const f = invocation();
    const error = new Error(point);
    if (point === "validation")
      f.entry.validateInput = () => {
        throw error;
      };
    if (point === "resolver")
      f.entry.resolveInput = () => {
        throw error;
      };
    if (point === "pre")
      f.behavior.hook = async () => {
        throw error;
      };
    if (point === "started")
      f.behavior.event = async () => {
        throw error;
      };
    if (point === "timeout") {
      f.entry.timeout = { defaultMs: 1000, allowCallOverride: false };
      f.entry.resolveTimeoutBudgetMs = () => {
        throw error;
      };
    }
    await assert.rejects(f.run(), (caught) => caught === error);
    assert.equal(f.timeline.includes(HookEventName.PostToolUseFailure), false);
    assert.deepEqual(f.terminal()[0]?.args, ["unhandled", "unknown", error]);
  }
});

test("plan denial and workflow feedback keep distinct turn and follow-up decisions", async () => {
  for (const name of ["ExitPlanMode", "CreateWorkflow", "AmendWorkflow"]) {
    const f = invocation();
    f.entry.metadata.name = name;
    f.call.name = name;
    f.deps.getMode = () => "plan";
    f.behavior.decision = "ask";
    f.behavior.reply = {
      decision: "deny",
      reason: "change the plan",
      reasonSource: name === "ExitPlanMode" ? "plan_approval_feedback" : "workflow_refine_feedback",
    };
    const result = await f.run();
    assert.equal(result.followUpUserInput?.input, "change the plan");
    assert.equal(result.turnControl, undefined);
  }
  const f = invocation();
  f.entry.metadata.name = "ExitPlanMode";
  f.call.name = "ExitPlanMode";
  f.deps.getMode = () => "plan";
  f.behavior.hook = async () => ({ additionalContexts: [], preventContinuation: true });
  assert.deepEqual((await f.run()).turnControl, {
    reason: "plan_exit_denied",
    stopTurnAfterResult: true,
  });
});

test("permission infrastructure failures retain the original error category", async () => {
  const f = invocation();
  f.behavior.decision = "ask";
  f.deps.permissionBroker.requestPermission = async () => {
    throw createCoreError(CoreErrorType.PermissionTimeout, "late");
  };
  const result = await f.run();
  assert.equal(result.error?.type, CoreErrorType.PermissionTimeout);
  assert.deepEqual(f.terminal()[0]?.args.slice(0, 2), ["permission", "permission"]);
});

test("Hook denial reads message and reason metadata separately and propagates accessor failure", async () => {
  const f = invocation();
  let reads = 0;
  const error = new Error("reason accessor failure");
  f.behavior.hook = async () => ({
    additionalContexts: [],
    permissionBehavior: "deny",
    get hookPermissionDecisionReason() {
      if (++reads > 1) throw error;
      return "blocked";
    },
  });
  await assert.rejects(f.run(), (caught) => caught === error);
  assert.equal(reads, 2);
  assert.deepEqual(f.terminal()[0]?.args, ["unhandled", "unknown", error]);
});
