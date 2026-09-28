// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { PermissionCapabilityGroup, type PermissionBrokerResult } from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";
import { PermissionService } from "../src/permission/service.js";
import { applyPermissionUpdates } from "../src/tool/executor/permission-rules.js";
import { recheckPermissionHookModifiedInput } from "../src/tool/executor/permission-input-recheck.js";
import { permissionFlow } from "./permission-flow-fixture.js";
import { grantUpdate } from "./permission-grant-fixture.js";
import { gate } from "./tool-invocation-fixture.js";

function recheckFixture() {
  const f = permissionFlow();
  const args = {
    deps: f.deps,
    entry: f.entry,
    mode: "build" as const,
    modifiedInput: { value: "changed" },
    projectRules: null,
    requestId: "fixture-request",
    signal: f.controller.signal,
    toolCall: f.call,
    traceContext: f.trace,
  };
  return { ...f, args, runRecheck: () => recheckPermissionHookModifiedInput(args) };
}

test("recheck captures the broker and method before request fields run callbacks", async () => {
  const f = recheckFixture();
  f.state.decision.ruleId = "rule.project.ask";
  const original = f.deps.permissionBroker;
  const handle = (decision: "allow" | "deny") =>
    Promise.resolve({
      result: Promise.resolve({ decision }),
      activate: () => true,
      dispose() {},
    });
  original.preparePermission = function () {
    assert.equal(this, original);
    f.timeline.push("original");
    return handle("deny");
  };
  const replacement = () => {
    f.timeline.push("replacement");
    return handle("allow");
  };
  Object.defineProperty(f.trace, "turnId", {
    get() {
      f.timeline.push("turn");
      original.preparePermission = replacement;
      f.deps.permissionBroker = {
        preparePermission: replacement,
        requestPermission: async () => ({ decision: "allow" }),
      };
      return "fixture-turn";
    },
  });
  const result = await f.runRecheck();
  assert.equal(result.brokerResult?.decision, "deny");
  assert.deepEqual(f.timeline, ["check", "turn", "original"]);
});

test("modified-input recheck keeps context, receiver, evaluation order and original rule snapshot", async () => {
  const f = recheckFixture();
  f.deps.getWorkingDirectory = function () {
    assert.equal(this, f.deps);
    f.timeline.push("cwd");
    return ".";
  };
  f.deps.getWorkspaceRoot = function () {
    assert.equal(this, f.deps);
    f.timeline.push("root");
    return ".";
  };
  f.deps.getMemoryRoot = () => {
    f.timeline.push("memory");
    return undefined;
  };
  const policy = { evaluateRules: () => false, suggestedPermissionUpdates: [] };
  f.entry.resolvePermissionRulePolicy = function (input, context) {
    assert.equal(this, f.entry);
    assert.equal(input, f.args.modifiedInput);
    assert.deepEqual(context, { runtimeScope: "main", workingDirectory: ".", workspaceRoot: "." });
    f.timeline.push("policy");
    return policy;
  };
  f.entry.resolvePermissionCapability = function (input) {
    assert.equal(this, f.entry);
    assert.equal(input, f.args.modifiedInput);
    f.timeline.push("capability");
    return { readOnly: false };
  };
  f.state.decision.decision = "allow";
  assert.deepEqual(await f.runRecheck(), {});
  assert.deepEqual(f.timeline, [
    "cwd",
    "root",
    "cwd",
    "policy",
    "capability",
    "check",
    "memory",
    "cwd",
    "root",
  ]);
  assert.equal(f.checks[0]![0].input, f.args.modifiedInput);
  assert.equal(f.checks[0]![2], f.args.projectRules);
  assert.equal(f.checks[0]![3], policy);
  assert.equal(f.requests.length, 0);
});

test("recheck denies explicitly and otherwise only project ask reopens the broker", async () => {
  for (const decision of ["allow", "ask", "deny"] as const)
    for (const ruleId of ["fixture", "rule.project.ask"])
      for (const alwaysAsk of [false, true]) {
        const f = recheckFixture();
        Object.assign(f.state.decision, { decision, ruleId, alwaysAsk });
        const result = await f.runRecheck();
        const asks = decision === "ask" && ruleId === "rule.project.ask";
        assert.equal(f.requests.length, asks ? 1 : 0);
        if (decision === "deny") {
          assert.deepEqual(result.brokerResult, { decision: "deny", reason: "fixture policy" });
          assert.equal(result.permissionDecision, f.state.decision);
        } else if (asks) {
          assert.equal(result.brokerResult, f.behavior.reply);
          assert.equal(result.permissionDecision, f.state.decision);
        } else assert.deepEqual(result, {});
      }
});

test("recheck prepares synchronously then activates/disposes once, without new Hook/events/claim", async () => {
  const f = recheckFixture();
  f.state.decision.ruleId = "rule.project.ask";
  f.deps.permissionTimeoutMs = 321;
  const answer = gate<PermissionBrokerResult>();
  f.deps.permissionBroker.preparePermission = function (request, options) {
    assert.equal(this, f.deps.permissionBroker);
    f.timeline.push("prepare");
    assert.equal(request.input, f.args.modifiedInput);
    assert.equal(request.requestId, f.args.requestId);
    assert.equal(request.mode, f.args.mode);
    assert.equal(request.turnId, f.deps.turnId);
    assert.equal(request.traceId, f.trace.traceId);
    assert.ok(request.requestedAt instanceof Date);
    assert.deepEqual(options, { signal: f.controller.signal, timeoutMs: 321 });
    return Promise.resolve({
      result: answer.promise,
      activate() {
        f.timeline.push("activate");
        return true;
      },
      dispose() {
        f.timeline.push("dispose");
      },
    });
  };
  const pending = f.runRecheck();
  assert.deepEqual(f.timeline, ["check", "prepare"]);
  answer.resolve({ decision: "allow" });
  assert.equal((await pending).brokerResult?.decision, "allow");
  assert.deepEqual(f.timeline, ["check", "prepare", "activate", "dispose"]);
  assert.equal(f.events.length, 0);
  assert.equal(f.observed.hooks.length, 0);
});

test("recheck preserves error values and disposes only after a handle exists", async () => {
  for (const stage of [
    "policy",
    "capability",
    "service",
    "prepare",
    "activate",
    "result",
  ] as const) {
    const f = recheckFixture(),
      failure = { stage };
    f.state.decision.ruleId = "rule.project.ask";
    let disposed = 0;
    const fail = () => {
      throw failure;
    };
    if (stage === "policy") f.entry.resolvePermissionRulePolicy = fail;
    if (stage === "capability") f.entry.resolvePermissionCapability = fail;
    if (stage === "service") f.deps.permissionService.checkPermission = fail;
    f.deps.permissionBroker.preparePermission =
      stage === "prepare"
        ? fail
        : async () => ({
            result:
              stage === "result" ? Promise.reject(failure) : Promise.resolve({ decision: "allow" }),
            activate: stage === "activate" ? fail : () => true,
            dispose() {
              disposed++;
            },
          });
    await assert.rejects(f.runRecheck(), (e) => e === failure);
    assert.equal(disposed, stage === "activate" || stage === "result" ? 1 : 0);
  }
});

test("recheck retains declared ask options without rerunning approval preview", async () => {
  for (const allowAlways of [false, "session"] as const) {
    const f = recheckFixture();
    f.state.decision.ruleId = "rule.project.ask";
    f.entry.permission.askOptions = { allowAlways };
    f.entry.prepareApproval = () => {
      throw new Error("must not run preview twice");
    };
    await f.runRecheck();
    assert.equal(
      f.requests[0]![0].optionsPolicy,
      allowAlways === false ? "no-always-allow" : "session-always-allow",
    );
  }
});

test("recheck CUA suggestions retain the trusted group and cannot grant an untrusted namesake", async () => {
  const f = recheckFixture();
  f.state.decision.ruleId = "rule.project.ask";
  f.entry.permissionCapabilityGroup = PermissionCapabilityGroup.OfficialCua;
  await f.runRecheck();
  const updates = f.requests[0]![0].suggestedPermissionUpdates!;
  assert.equal(updates[0]!.rules[0]!.toolName, OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME);
  const service = new PermissionService();
  const rules = applyPermissionUpdates({ version: 1 }, updates);
  const context = {
    toolName: f.call.name,
    mode: "build" as const,
    riskLevel: "low" as const,
    input: f.args.modifiedInput,
  };
  const capability = { readOnly: false, needsApproval: true, sideEffectScope: "system" as const };
  assert.equal(
    service.checkPermission(
      context,
      {
        ...capability,
        permissionCapabilityGroup: PermissionCapabilityGroup.OfficialCua,
      },
      rules,
    ).decision,
    "allow",
  );
  assert.equal(service.checkPermission(context, capability, rules).decision, "ask");
});

test("recheck honors custom suggestions including an empty list and keeps default option field absent", async () => {
  for (const suggestions of [[], grantUpdate("Custom")]) {
    const f = recheckFixture();
    f.state.decision.ruleId = "rule.project.ask";
    f.entry.permissionCapabilityGroup = PermissionCapabilityGroup.OfficialCua;
    f.entry.resolvePermissionRulePolicy = () => ({
      evaluateRules: () => false,
      suggestedPermissionUpdates: suggestions,
    });
    await f.runRecheck();
    assert.equal(f.requests[0]![0].suggestedPermissionUpdates, suggestions);
    assert.equal(Object.hasOwn(f.requests[0]![0], "optionsPolicy"), false);
  }
});
