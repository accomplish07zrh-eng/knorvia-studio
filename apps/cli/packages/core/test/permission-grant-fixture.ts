// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerResult, PermissionUpdate } from "@knorvia/contracts";
import { applyResolvedPermissionGrants } from "../src/tool/executor/permission-grants.js";
import { permissionFlow } from "./permission-flow-fixture.js";

export function grantUpdate(name = "Fixture"): PermissionUpdate[] {
  return [{ type: "addRules", behavior: "allow", rules: [{ toolName: name }] }];
}
export function grantFixture() {
  const f = permissionFlow();
  const { store, writes } = f.withStore();
  return {
    ...f,
    store,
    writes,
    apply(reply: PermissionBrokerResult = { decision: "allow" }) {
      return applyResolvedPermissionGrants({
        deps: f.deps,
        toolCall: f.call,
        entry: f.entry,
        resolvedPermission: reply,
        requestId: "fixture-request",
        traceContext: f.trace,
      });
    },
  };
}
