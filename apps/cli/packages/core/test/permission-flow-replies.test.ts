// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  createCoreError,
  HookEventName,
  SessionEventType,
  type PermissionBrokerResult,
  type PermissionUpdate,
} from "@knorvia/contracts";
import { permissionFlow } from "./permission-flow-fixture.js";
import { eventPayload, gate } from "./tool-invocation-fixture.js";

const updates: PermissionUpdate[] = [
  { type: "addRules", behavior: "allow", rules: [{ toolName: "Fixture" }] },
];

test("broker failures preserve CoreError category or wrap unknown values, then publish one denial", async () => {
  const core = createCoreError(CoreErrorType.PermissionTimeout, "fixture timeout");
  for (const failure of [core, new Error("broker failed"), { broker: "failed" }]) {
    const f = permissionFlow();
    f.deps.permissionBroker.requestPermission = async () => {
      throw failure;
    };
    const outcome = await f.resolve();
    assert.equal(outcome.allowed, false);
    if (outcome.allowed) assert.fail("unexpected permission");
    assert.equal(
      outcome.result.error?.type,
      failure === core ? CoreErrorType.PermissionTimeout : CoreErrorType.PermissionDenied,
    );
    assert.equal(
      outcome.result.error?.message,
      failure === core ? "fixture timeout" : "Permission request failed",
    );
    assert.deepEqual(
      f.events.map((event) => event.type),
      [SessionEventType.PermissionRequested, SessionEventType.PermissionResolved],
    );
    const resolution = eventPayload(f.events[1]);
    assert.equal(resolution.decision, "deny");
    assert.equal(f.observed.telemetry.at(-1)?.args[0], "denied");
  }
});

test("resolved publication failure keeps its own error instead of recursively publishing denial", async () => {
  const f = permissionFlow(),
    failure = { resolved: "failed" };
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionResolved) throw failure;
  };
  await assert.rejects(f.resolve(), (error) => error === failure);
  assert.equal(f.events.length, 2);
  assert.equal(
    f.observed.telemetry.some((item) => item.args[0] === "granted"),
    false,
  );
});

test("deny and escalation skip all grants and keep their separate result categories", async () => {
  for (const decision of ["deny", "escalate"] as const) {
    const f = permissionFlow(),
      { writes } = f.withStore();
    f.behavior.reply = {
      decision,
      reason: "fixture refusal",
      permissionUpdates: updates,
      sessionPermissionUpdates: updates,
    };
    const outcome = await f.resolve();
    assert.equal(outcome.allowed, false);
    if (outcome.allowed) assert.fail("unexpected permission");
    assert.equal(
      outcome.result.error?.type,
      decision === "deny" ? CoreErrorType.PermissionDenied : CoreErrorType.PermissionEscalation,
    );
    assert.equal(writes.length, 0);
    assert.equal(f.sessionGrants.length, 0);
    assert.equal(f.observed.telemetry.at(-1)?.args[0], "denied");
  }
});

test("reply metadata is read for the snapshot while resolved emits before project and session grants", async () => {
  const f = permissionFlow(),
    { writes } = f.withStore(),
    resolvedAt = new Date(1000);
  let dateReads = 0;
  f.behavior.reply = {
    decision: "allow",
    get resolvedAt() {
      dateReads++;
      return resolvedAt;
    },
    permissionUpdates: updates,
    sessionPermissionUpdates: updates,
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, true);
  assert.equal(dateReads, 2);
  assert.equal(Object.hasOwn(eventPayload(f.events[1]), "resolvedAt"), false);
  assert.ok(
    f.timeline.indexOf(SessionEventType.PermissionResolved) < f.timeline.indexOf("store.save"),
  );
  assert.equal(writes.length, 1);
  assert.equal(f.sessionGrants[0], updates);
  assert.equal(f.observed.telemetry.at(-1)?.args[0], "granted");
});

test("grant persistence failure returns storage error without granting or applying session updates", async () => {
  const f = permissionFlow(),
    { store } = f.withStore();
  store.saveProjectPermission = async () => {
    throw new Error("fixture write failed");
  };
  f.behavior.reply = {
    decision: "allow",
    permissionUpdates: updates,
    sessionPermissionUpdates: updates,
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, false);
  if (outcome.allowed) assert.fail("unexpected permission");
  assert.equal(outcome.result.error?.type, CoreErrorType.StorageError);
  assert.equal(f.sessionGrants.length, 0);
  assert.equal(
    f.observed.telemetry.some((item) => item.args[0] === "granted"),
    false,
  );
  assert.equal(eventPayload(f.events[1]).decision, "allow");
});

test("broker modification normalizes and validates after resolved publication and granted telemetry", async () => {
  for (const valid of [false, true]) {
    const f = permissionFlow(),
      modified = valid ? { value: "changed" } : {};
    f.behavior.reply = { decision: "modify", modifiedInput: modified };
    const outcome = await f.resolve();
    assert.equal(outcome.allowed, valid);
    assert.equal(f.observed.telemetry.at(-1)?.args[0], "granted");
    assert.equal(eventPayload(f.events[1]).decision, "modify");
    if (outcome.allowed) assert.equal(outcome.executionInput, modified);
    else assert.equal(outcome.result.error?.type, CoreErrorType.ToolExecutionFailed);
  }
});

test("user-only authority gives no suggestions or saved grants and ignores automatic hook allowance", async () => {
  const f = permissionFlow(),
    user = gate<PermissionBrokerResult>();
  f.entry.approvalAuthority = "user";
  f.entry.resolvePermissionRulePolicy = () => ({
    evaluateRules: () => false,
    suggestedPermissionUpdates: updates,
  });
  f.behavior.hook = async (input) => ({
    additionalContexts: [],
    ...(input.hookEventName === HookEventName.PermissionRequest
      ? { permissionBehavior: "allow" as const }
      : {}),
  });
  f.deps.permissionBroker.requestPermission = async (request) => {
    assert.deepEqual(request.suggestedPermissionUpdates, []);
    return user.promise;
  };
  let completed = false;
  const pending = f.resolve().then((result) => {
    completed = true;
    return result;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  user.resolve({
    decision: "allow",
    permissionUpdates: updates,
    sessionPermissionUpdates: updates,
  });
  assert.equal((await pending).allowed, true);
  assert.equal(f.sessionGrants.length, 0);
});

test("valid hook modification is rechecked and explicit policy denial wins", async () => {
  const f = permissionFlow();
  f.deps.permissionBroker.requestPermission = () => new Promise(() => {});
  f.behavior.hook = async () => ({
    additionalContexts: [],
    permissionRequestResult: { behavior: "allow", updatedInput: { value: "changed" } },
  });
  const originalCheck = f.deps.permissionService.checkPermission;
  f.deps.permissionService.checkPermission = function (...args) {
    const decision = originalCheck.apply(this, args);
    return f.checks.length === 1
      ? decision
      : { ...decision, decision: "deny", reason: "changed target denied" };
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, false);
  assert.equal(f.checks.length, 2);
  assert.deepEqual(f.checks[1][0].input, { value: "changed" });
  assert.equal(eventPayload(f.events[1]).decision, "deny");
});

test("hook rewrite asking again reuses request ID and passes the rechecked input after user approval", async () => {
  const f = permissionFlow(),
    calls: string[] = [],
    modified = { value: "changed" };
  f.state.decision.ruleId = "rule.project.ask";
  f.behavior.hook = async () => ({
    additionalContexts: [],
    permissionRequestResult: { behavior: "allow", updatedInput: modified },
  });
  f.deps.permissionBroker.requestPermission = (request) => {
    calls.push(request.requestId);
    if (calls.length === 1) return new Promise(() => {});
    assert.equal(request.input, modified);
    return Promise.resolve({ decision: "allow" });
  };
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, true);
  if (!outcome.allowed) assert.fail("unexpected refusal");
  assert.equal(outcome.executionInput, modified);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.equal(
    f.events.filter((event) => event.type === SessionEventType.PermissionRequested).length,
    1,
  );
});

test("invalid hook rewrite is not rechecked but still reaches the original final validation boundary", async () => {
  const f = permissionFlow();
  f.deps.permissionBroker.requestPermission = () => new Promise(() => {});
  f.behavior.hook = async () => ({
    additionalContexts: [],
    permissionRequestResult: { behavior: "allow", updatedInput: {} },
  });
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, false);
  assert.equal(f.checks.length, 1);
  assert.equal(eventPayload(f.events[1]).decision, "modify");
  assert.equal(f.observed.telemetry.at(-1)?.args[0], "granted");
});

test("cancellation is propagated through broker error handling without any handler execution", async () => {
  const f = permissionFlow();
  f.deps.permissionBroker.requestPermission = (_request, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
        once: true,
      });
      f.controller.abort(new Error("fixture cancelled"));
    });
  const outcome = await f.resolve();
  assert.equal(outcome.allowed, false);
  assert.equal(f.observed.inputs.length, 0);
  assert.equal(eventPayload(f.events[1]).decision, "deny");
});
