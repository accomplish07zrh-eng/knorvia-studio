// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, SessionEventType, type PermissionUpdate } from "@knorvia/contracts";
import { permissionFlow } from "./permission-flow-fixture.js";
import { eventPayload } from "./tool-invocation-fixture.js";

test("assessment captures rule context before storage and supplies original rules and suggestion references", async () => {
  const f = permissionFlow(),
    suggestions: PermissionUpdate[] = [
      { type: "addRules", behavior: "allow", rules: [{ toolName: "Fixture" }] },
    ];
  const policy = { evaluateRules: () => false, suggestedPermissionUpdates: suggestions };
  f.state.rules = { version: 1, ask: [{ toolName: "Fixture" }] };
  f.withStore();
  f.entry.resolvePermissionRulePolicy = function (input, context) {
    assert.equal(this, f.entry);
    assert.equal(input, f.call.input);
    assert.deepEqual(context, { runtimeScope: "main", workingDirectory: ".", workspaceRoot: "." });
    f.timeline.push("policy");
    return policy;
  };
  f.entry.resolvePermissionCapability = () => ({
    readOnly: false,
    permission: { sideEffectScope: "workspace" },
  });
  await f.resolve();
  assert.ok(f.timeline.indexOf("policy") < f.timeline.indexOf("store.session"));
  const [context, capability, rules, rulePolicy] = f.checks[0];
  assert.equal(context.input, f.call.input);
  assert.equal(context.toolName, "Fixture");
  assert.equal(context.mode, "build");
  assert.equal(capability?.readOnly, false);
  assert.equal(capability?.permission?.sideEffectScope, "workspace");
  assert.equal(rules, f.state.rules);
  assert.equal(rulePolicy, policy);
  assert.equal(f.requests[0][0].suggestedPermissionUpdates, suggestions);
});

test("project read failure returns the storage error projection without assessment or permission events", async () => {
  for (const failure of [new Error("fixture storage failure"), { storage: "failed" }]) {
    const f = permissionFlow(),
      { store } = f.withStore();
    store.getProjectPermission = async () => {
      throw failure;
    };
    const outcome = await f.resolve();
    assert.equal(outcome.allowed, false);
    if (outcome.allowed) assert.fail("unexpected permission");
    assert.equal(outcome.result.error?.type, CoreErrorType.StorageError);
    assert.equal(outcome.result.error?.message, "Failed to load project permission rules");
    assert.equal(Object.hasOwn(outcome.result.error!, "recoverable"), false);
    assert.equal(f.checks.length, 0);
    assert.deepEqual(f.events, []);
    assert.equal(f.requests.length, 0);
  }
});

test("rule policy and service exceptions remain outside storage and response catches", async () => {
  for (const phase of ["policy", "service"]) {
    const f = permissionFlow(),
      failure = { phase };
    if (phase === "policy")
      f.entry.resolvePermissionRulePolicy = () => {
        throw failure;
      };
    else
      f.deps.permissionService.checkPermission = () => {
        throw failure;
      };
    await assert.rejects(f.resolve(), (error) => error === failure);
    assert.deepEqual(f.events, []);
    assert.equal(f.requests.length, 0);
  }
});

test("allowed takes precedence and returns the original input without wait metadata or preview", async () => {
  const f = permissionFlow();
  f.state.decision.allowed = true;
  f.state.decision.decision = "deny";
  f.entry.prepareApproval = () => {
    assert.fail("unexpected preview");
  };
  const outcome = await f.resolve();
  assert.deepEqual(outcome, { allowed: true, executionInput: f.call.input });
  assert.equal(outcome.executionInput, f.call.input);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.observed.telemetry, [
    { name: "setPermissionDecision", args: ["not_required"] },
  ]);
});

test("explicit denial publishes only denied before its diagnostic and retains rule context", async () => {
  const f = permissionFlow();
  f.state.decision.decision = "deny";
  f.entry.prepareApproval = () => {
    assert.fail("unexpected preview");
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, false);
  if (outcome.allowed) assert.fail("unexpected permission");
  assert.equal(outcome.result.error?.type, CoreErrorType.PermissionDenied);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.PermissionDenied],
  );
  assert.equal(eventPayload(f.events[0]).reason, "fixture policy");
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.observed.telemetry, [{ name: "setPermissionDecision", args: ["denied"] }]);
  assert.equal(f.observed.logs.at(-1)?.[1], "Tool permission denied");
});

test("PreToolUse decisions apply after service but cannot weaken alwaysAsk", async () => {
  for (const alwaysAsk of [false, true]) {
    const f = permissionFlow();
    f.state.decision.alwaysAsk = alwaysAsk;
    f.state.preHook.permissionBehavior = "allow";
    const outcome = await f.resolve();
    assert.equal(outcome.allowed, true);
    assert.equal(f.requests.length, alwaysAsk ? 1 : 0);
  }
});

test("requested publication failure escapes unchanged before any broker and after requested telemetry", async () => {
  const f = permissionFlow(),
    failure = { publish: "failed" };
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionRequested) throw failure;
  };
  await assert.rejects(f.resolve(), (error) => error === failure);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.PermissionRequested],
  );
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.observed.telemetry, [{ name: "markPermissionRequested", args: [] }]);
});

test("broker requests preserve optional fields, identity, trace fallback and current event ordering", async () => {
  const f = permissionFlow();
  f.entry.permission.askOptions = { allowAlways: "session" };
  f.deps.permissionTimeoutMs = 321;
  await f.resolve();
  const [request, options] = f.requests[0];
  assert.equal(request.input, f.call.input);
  assert.match(request.requestId, /^perm_[\da-f-]+$/);
  assert.equal(request.traceId, f.trace.traceId);
  assert.equal(request.turnId, f.deps.turnId);
  assert.equal(request.optionsPolicy, "session-always-allow");
  assert.equal(request.ruleId, f.state.decision.ruleId);
  assert.ok(request.requestedAt instanceof Date);
  assert.equal(options?.timeoutMs, 321);
  assert.ok(options?.signal instanceof AbortSignal);
  assert.equal(typeof options?.claimResponse, "function");
  assert.ok(
    f.timeline.indexOf(SessionEventType.PermissionRequested) < f.timeline.indexOf("broker"),
  );
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.PermissionRequested, SessionEventType.PermissionResolved],
  );
});

test("permission wait time excludes requested-event work and keeps rounded nonnegative duration", async (t) => {
  const f = permissionFlow();
  let clock = 100;
  t.mock.method(Date, "now", () => clock);
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionRequested) clock = 600;
  };
  f.deps.permissionBroker.requestPermission = async () => {
    clock = 642.6;
    return { decision: "allow" };
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, true);
  if (!outcome.allowed) assert.fail("unexpected refusal");
  assert.equal(outcome.permissionWaitMs, 43);
});
