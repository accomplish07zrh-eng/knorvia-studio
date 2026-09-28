// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  HookEventName,
  SessionEventType,
  type PermissionBrokerResult,
  type PermissionBrokerRequest,
} from "@knorvia/contracts";
import { PermissionService } from "../../core/src/permission/service.js";
import { permissionFlow } from "../../core/test/permission-flow-fixture.js";
import { gate } from "../../core/test/tool-invocation-fixture.js";
import { createProtocolInteractionBroker } from "../src/protocol/interaction-broker.js";
import type { KnorviaProtocolAgentServerContext } from "../src/protocol/server-types.js";
import { V4InteractionRegistry } from "../src/protocol-v4/interaction-registry.js";
import { buildProtocolPermissionOptions } from "../src/protocol/permission-options.js";

function fixture() {
  const f = permissionFlow();
  const registry = new V4InteractionRegistry();
  const secondStarted = gate(),
    firstRpc = gate<PermissionBrokerResult>();
  const seen: { id: string; input: unknown; signal: AbortSignal }[] = [];
  const requests: PermissionBrokerRequest[] = [];
  const modified = { value: "changed" };
  f.state.rules = { version: 1, ask: [{ toolName: "Fixture" }] };
  f.withStore();
  f.deps.permissionService = new PermissionService();
  f.behavior.hook = async (input) => ({
    additionalContexts: [],
    ...(input.hookEventName === HookEventName.PermissionRequest
      ? {
          permissionRequestResult: { behavior: "allow" as const, updatedInput: modified },
        }
      : {}),
  });
  const context = {
    v4Interactions: registry,
    sessions: new Map(),
    deps: {},
    requestClient(
      _method: unknown,
      payload: { requestId: string; input: unknown },
      _schema: unknown,
      options: { signal: AbortSignal },
    ) {
      seen.push({ id: payload.requestId, input: payload.input, signal: options.signal });
      if (seen.length === 1) return firstRpc.promise;
      secondStarted.resolve();
      return new Promise(() => {});
    },
  } as unknown as KnorviaProtocolAgentServerContext;
  f.deps.permissionBroker = createProtocolInteractionBroker(context);
  const prepare = f.deps.permissionBroker.preparePermission;
  f.deps.permissionBroker.preparePermission = function (...args) {
    requests.push(args[0]);
    return prepare.apply(this, args);
  };
  return { ...f, registry, secondStarted, firstRpc, seen, requests, modified };
}

for (const completion of ["allow", "cancel"] as const)
  test(`same-ID recheck ignores a late first RPC and finishes cleanly on ${completion}`, async () => {
    const f = fixture();
    const pending = f.resolve();
    try {
      await f.secondStarted.promise;
      assert.equal(f.seen.length, 2);
      const [first, second] = f.seen;
      assert.equal(first!.id, second!.id);
      assert.equal(first!.input, f.call.input);
      assert.equal(second!.input, f.modified);
      assert.equal(first!.signal.aborted, true);
      assert.equal(second!.signal.aborted, false);
      f.firstRpc.resolve({ decision: "deny", reason: "late fixture response" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.registry.has(second!.id), true);
      if (completion === "allow")
        assert.equal(f.registry.resolve(second!.id, { optionId: "allow_once" }), true);
      else f.controller.abort();
      const result = await pending;
      assert.equal(result.allowed, completion === "allow");
      if (result.allowed) assert.equal(result.executionInput, f.modified);
      assert.equal(second!.signal.aborted, true);
      assert.equal(f.registry.has(second!.id), false);
      for (const type of [
        SessionEventType.PermissionRequested,
        SessionEventType.PermissionResolved,
      ])
        assert.equal(f.events.filter((event) => event.type === type).length, 1);
    } finally {
      f.firstRpc.resolve({ decision: "deny" });
      f.controller.abort();
      await pending;
    }
  });

test("both original and rewritten requests expose only the tool's declared V4 choices", async () => {
  for (const allowAlways of [false, "session"] as const) {
    const f = fixture();
    f.entry.permission.askOptions = { allowAlways };
    const pending = f.resolve();
    try {
      await f.secondStarted.promise;
      assert.equal(f.requests.length, 2);
      for (const request of f.requests) {
        const ids = buildProtocolPermissionOptions(request).map((option) => option.optionId);
        assert.deepEqual(
          ids,
          allowAlways === false ? ["allow_once", "deny"] : ["allow_once", "allowSession", "deny"],
        );
      }
      assert.equal(f.registry.resolve(f.seen[1]!.id, { optionId: "allow_once" }), true);
      assert.equal((await pending).allowed, true);
    } finally {
      f.firstRpc.resolve({ decision: "deny" });
      f.controller.abort();
      await pending;
    }
  }
});
