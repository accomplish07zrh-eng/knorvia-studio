// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { PermissionCapabilityGroup, SessionEventType } from "@knorvia/contracts";
import { PermissionService } from "../src/permission/service.js";
import {
  resolveRuntimePermissionCapability,
  resolveRuntimePermissionContext,
  resolveToolCallCapabilityFlags,
} from "../src/tool/executor/permission-capability.js";
import { eventPayload, invocation } from "./tool-invocation-fixture.js";

test("runtime capability overlays independent permission records and keeps trusted provenance", () => {
  const f = invocation();
  const input = { value: "fixture" };
  const context = { workingDirectory: ".", workspaceRoot: ".", runtimeScope: "main" as const };
  const askOptions = { allowAlways: "session" as const };
  const runtime = {
    readOnly: false,
    permissionCapabilityGroup: PermissionCapabilityGroup.OfficialCua,
    permission: { sideEffectScope: "network" as const, askOptions },
  };
  f.entry.resolvePermissionCapability = function (value, scope) {
    assert.equal(this, f.entry);
    assert.equal(value, input);
    assert.equal(scope, context);
    return runtime;
  };
  const merged = resolveRuntimePermissionCapability(f.entry, input, context);
  assert.equal(merged.readOnly, false);
  assert.equal(merged.permissionCapabilityGroup, undefined);
  assert.equal(merged.permission?.sideEffectScope, "network");
  assert.equal(merged.permission?.reason, "fixture");
  assert.equal(merged.permission?.askOptions, askOptions);
  assert.notEqual(merged.permission, f.entry.permission);
  assert.notEqual(merged.permission, runtime.permission);
  f.entry.permissionCapabilityGroup = PermissionCapabilityGroup.OfficialCua;
  assert.equal(
    resolveRuntimePermissionCapability(f.entry, input, context).permissionCapabilityGroup,
    PermissionCapabilityGroup.OfficialCua,
  );
  assert.equal(f.entry.permission.sideEffectScope, "none");
});

test("runtime context reads ports in order with their receiver and propagates failures", () => {
  const f = invocation();
  f.deps.getWorkingDirectory = function () {
    assert.equal(this, f.deps);
    f.timeline.push("cwd");
    return "fixture-work";
  };
  f.deps.getWorkspaceRoot = function () {
    assert.equal(this, f.deps);
    f.timeline.push("root");
    return "fixture-root";
  };
  assert.deepEqual(resolveRuntimePermissionContext(f.deps), {
    runtimeScope: "main",
    workingDirectory: "fixture-work",
    workspaceRoot: "fixture-root",
  });
  assert.deepEqual(f.timeline, ["cwd", "root"]);
  const failure = { reason: "fixture resolver" };
  f.entry.resolvePermissionCapability = () => {
    throw failure;
  };
  assert.throws(
    () => resolveToolCallCapabilityFlags(f.deps, f.entry, {}),
    (e) => e === failure,
  );
});

test("Started scope honors the same nested override as permission evaluation", async () => {
  const f = invocation();
  f.entry.resolvePermissionCapability = () => ({
    readOnly: false,
    permission: { sideEffectScope: "workspace" },
  });
  const service = new PermissionService();
  const decision = service.checkPermission(
    { toolName: "Fixture", input: f.call.input, mode: "build", riskLevel: "low" },
    resolveRuntimePermissionCapability(
      f.entry,
      f.call.input,
      resolveRuntimePermissionContext(f.deps),
    ),
  );
  const flags = resolveToolCallCapabilityFlags(f.deps, f.entry, f.call.input);
  assert.equal(flags.sideEffectScope, decision.sideEffectScope);
  assert.deepEqual(flags, { readOnly: false, sideEffectScope: "workspace" });
  assert.equal((await f.run()).success, true);
  const started = f.events.find((e) => e.type === SessionEventType.ToolCallStarted);
  assert.ok(started);
  assert.equal(eventPayload(started).sideEffectScope, "workspace");
});

test("capability flags preserve unknown values and do not cache separate invocations", () => {
  const f = invocation();
  let calls = 0;
  f.entry.resolvePermissionCapability = () => {
    calls++;
    return {
      readOnly: undefined,
      sideEffectScope: undefined,
      permission: { sideEffectScope: undefined },
    };
  };
  for (let i = 0; i < 2; i++)
    assert.deepEqual(resolveToolCallCapabilityFlags(f.deps, f.entry, {}), {
      readOnly: undefined,
      sideEffectScope: undefined,
    });
  assert.equal(calls, 2);
});

test("an explicit nested none declaration outranks a conflicting runtime top-level scope", () => {
  const f = invocation();
  f.entry.resolvePermissionCapability = () => ({ readOnly: false, sideEffectScope: "workspace" });
  const context = {
    toolName: f.call.name,
    input: f.call.input,
    mode: "build" as const,
    riskLevel: "low" as const,
  };
  const capability = resolveRuntimePermissionCapability(
    f.entry,
    f.call.input,
    resolveRuntimePermissionContext(f.deps),
  );
  const decision = new PermissionService().checkPermission(context, capability);
  assert.equal(decision.sideEffectScope, "none");
  assert.deepEqual(resolveToolCallCapabilityFlags(f.deps, f.entry, f.call.input), {
    readOnly: false,
    sideEffectScope: decision.sideEffectScope,
  });
});
