// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import type { PermissionRuleset, PermissionUpdate, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../src/hooks/index.js";
import type { PermissionDecisionResult } from "../src/permission/service.js";
import { resolveToolPermission } from "../src/tool/executor/permission-flow.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";
import { invocation } from "./tool-invocation-fixture.js";

export function permissionFlow() {
  const f = invocation();
  const controller = new AbortController();
  const checks: Parameters<ToolExecutorDeps["permissionService"]["checkPermission"]>[] = [];
  const requests: Parameters<ToolExecutorDeps["permissionBroker"]["requestPermission"]>[] = [];
  const sessionGrants: PermissionUpdate[][] = [];
  const trace: TraceContext = {
    traceId: "fixture-trace" as TraceContext["traceId"],
    spanId: "fixture-span",
  };
  const state: {
    decision: PermissionDecisionResult;
    preHook: HookRunResult;
    rules: PermissionRuleset | null;
  } = {
    decision: {
      allowed: false,
      decision: "ask",
      escalated: true,
      mode: "build",
      reason: "fixture policy",
      riskLevel: "low",
      ruleId: "fixture",
      sideEffectScope: "none",
    },
    preHook: { additionalContexts: [] },
    rules: null,
  };
  f.deps.permissionService.checkPermission = function (...args) {
    assert.equal(this, f.deps.permissionService);
    checks.push(args);
    f.timeline.push("check");
    return state.decision;
  };
  f.deps.permissionService.grantSessionPermission = (updates) => {
    sessionGrants.push(updates);
  };
  const originalBroker = f.deps.permissionBroker.requestPermission;
  f.deps.permissionBroker.requestPermission = function (...args) {
    assert.equal(this, f.deps.permissionBroker);
    requests.push(args);
    return originalBroker.apply(this, args);
  };
  return {
    ...f,
    state,
    checks,
    requests,
    sessionGrants,
    controller,
    trace,
    resolve: (implementation = resolveToolPermission) =>
      implementation(
        f.deps,
        f.call,
        f.entry,
        f.call.input,
        state.preHook,
        "build",
        trace,
        controller.signal,
        f.writer,
      ),
    withStore() {
      const writes: unknown[] = [];
      const store = {
        async getSession() {
          f.timeline.push("store.session");
          return { projectID: "fixture-project" };
        },
        async getProjectPermission(): Promise<PermissionRuleset | null> {
          f.timeline.push("store.rules");
          return state.rules;
        },
        async saveProjectPermission(value: unknown) {
          f.timeline.push("store.save");
          writes.push(value);
        },
      };
      f.deps.sessionStore = store as unknown as ToolExecutorDeps["sessionStore"];
      return { store, writes };
    },
  };
}
