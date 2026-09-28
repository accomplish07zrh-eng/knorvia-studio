// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  type PermissionBrokerResult,
  type PermissionUpdate,
} from "@knorvia/contracts";
import { grantFixture, grantUpdate } from "./permission-grant-fixture.js";
import { gate } from "./tool-invocation-fixture.js";
import { applyResolvedPermissionGrants } from "../src/tool/executor/permission-grants.js";

test("user-only authority stops before reading any update or state port", async () => {
  const f = grantFixture();
  f.entry.approvalAuthority = "user";
  const reply: PermissionBrokerResult = {
    decision: "allow",
    get permissionUpdates(): PermissionUpdate[] {
      throw new Error("unread project");
    },
    get sessionPermissionUpdates(): PermissionUpdate[] {
      throw new Error("unread session");
    },
  };
  Object.defineProperty(f.deps, "sessionStore", {
    get() {
      throw new Error("unread store");
    },
  });
  Object.defineProperty(f.deps, "permissionService", {
    get() {
      throw new Error("unread service");
    },
  });
  assert.equal(await f.apply(reply), undefined);
  assert.deepEqual(f.observed.logs, []);
});

test("empty updates do not call either owner and helper does not re-decide accepted replies", async () => {
  const f = grantFixture();
  assert.equal(
    await f.apply({ decision: "allow", permissionUpdates: [], sessionPermissionUpdates: [] }),
    undefined,
  );
  assert.deepEqual(f.timeline, []);
  assert.deepEqual(f.sessionGrants, []);
  const updates = grantUpdate();
  await f.apply({ decision: "deny", sessionPermissionUpdates: updates });
  assert.equal(f.sessionGrants[0], updates);
});

test("session grant waits for project save and reads the live reply only after that await", async () => {
  const f = grantFixture(),
    entered = gate(),
    release = gate();
  const project = grantUpdate("Project"),
    before = grantUpdate("Before"),
    after = grantUpdate("After");
  const reply: PermissionBrokerResult = {
    decision: "allow",
    permissionUpdates: project,
    sessionPermissionUpdates: before,
  };
  const save = f.store.saveProjectPermission;
  f.store.saveProjectPermission = async function (input) {
    entered.resolve();
    await release.promise;
    await save.call(this, input);
  };
  const originalGrant = f.deps.permissionService.grantSessionPermission;
  f.deps.permissionService.grantSessionPermission = function (updates) {
    assert.equal(this, f.deps.permissionService);
    f.timeline.push("session.grant");
    originalGrant.call(this, updates);
  };
  const originalLog = f.deps.logger!.info;
  f.deps.logger!.info = function (message, context) {
    f.timeline.push(message);
    originalLog.call(this, message, context);
  };
  const pending = f.apply(reply);
  await entered.promise;
  assert.equal(f.sessionGrants.length, 0);
  assert.equal(f.observed.logs.length, 0);
  reply.sessionPermissionUpdates = after;
  release.resolve();
  assert.equal(await pending, undefined);
  assert.equal(f.sessionGrants[0], after);
  assert.deepEqual(f.timeline, [
    "store.session",
    "store.rules",
    "store.save",
    "Project permission updated",
    "session.grant",
    "Session permission granted",
  ]);
  const log = f.observed.logs.at(-1)![2] as Record<string, unknown>;
  assert.equal(log.event, "tool.permission.session_grant.applied");
  assert.equal(log.requestId, "fixture-request");
  assert.equal(log.updateCount, 1);
  assert.deepEqual(Object.keys(log), [
    "traceId",
    "queryId",
    "spanId",
    "parentSpanId",
    "sessionId",
    "turnId",
    "event",
    "module",
    "requestId",
    "status",
    "toolCallId",
    "toolName",
    "updateCount",
  ]);
});

test("the invocation context references are captured before a pending project write", async () => {
  const f = grantFixture(),
    other = grantFixture(),
    entered = gate(),
    release = gate();
  f.store.saveProjectPermission = async () => {
    entered.resolve();
    await release.promise;
  };
  const original = grantUpdate("Original");
  const input = {
    deps: f.deps,
    toolCall: f.call,
    entry: f.entry,
    resolvedPermission: {
      decision: "allow" as const,
      permissionUpdates: grantUpdate(),
      sessionPermissionUpdates: original,
    },
    requestId: "original-request",
    traceContext: f.trace,
  };
  const pending = applyResolvedPermissionGrants(input);
  await entered.promise;
  input.deps = other.deps;
  input.resolvedPermission = {
    decision: "allow",
    permissionUpdates: [],
    sessionPermissionUpdates: grantUpdate("Other"),
  };
  input.requestId = "other-request";
  input.traceContext = other.trace;
  release.resolve();
  await pending;
  assert.equal(f.sessionGrants[0], original);
  assert.equal(other.sessionGrants.length, 0);
  assert.equal(
    (f.observed.logs.at(-1)![2] as Record<string, unknown>).requestId,
    "original-request",
  );
});

test("project completion retains the original single-await session handoff", async () => {
  const f = grantFixture(),
    before = grantUpdate("Before"),
    after = grantUpdate("After");
  const reply: PermissionBrokerResult = {
    decision: "allow",
    permissionUpdates: grantUpdate(),
    sessionPermissionUpdates: before,
  };
  f.deps.logger!.info = (message) => {
    if (message === "Project permission updated")
      queueMicrotask(() =>
        queueMicrotask(() => {
          reply.sessionPermissionUpdates = after;
        }),
      );
  };
  await f.apply(reply);
  assert.equal(f.sessionGrants[0], before);
});

test("project read and save failures become storage results and never apply session updates", async () => {
  for (const phase of ["read", "save"])
    for (const failure of [new Error("fixture failure"), { fixture: "non-error" }]) {
      const f = grantFixture();
      if (phase === "read")
        f.store.getProjectPermission = async () => {
          throw failure;
        };
      else
        f.store.saveProjectPermission = async () => {
          throw failure;
        };
      const result = await f.apply({
        decision: "allow",
        permissionUpdates: grantUpdate(),
        sessionPermissionUpdates: grantUpdate(),
      });
      assert.equal(result?.success, false);
      assert.equal(result?.error?.type, CoreErrorType.StorageError);
      assert.equal(result?.error?.message, "Failed to persist project permission update");
      assert.equal(result?.toolCallId, f.call.id);
      assert.equal(result?.toolName, f.call.name);
      assert.deepEqual(f.sessionGrants, []);
    }
});

test("project update presence getter escapes while an actual update-read failure is projected", async () => {
  const failure = { fixture: "reply getter" };
  const f = grantFixture();
  await assert.rejects(
    f.apply({
      decision: "allow",
      get permissionUpdates(): PermissionUpdate[] {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  let reads = 0;
  const result = await f.apply({
    decision: "allow",
    get permissionUpdates() {
      if (++reads === 2) throw failure;
      return grantUpdate();
    },
  });
  assert.equal(result?.error?.type, CoreErrorType.StorageError);
  assert.equal(reads, 2);
});

test("a project log failure preserves the completed write but prevents the session phase", async () => {
  const f = grantFixture(),
    failure = { fixture: "project log" };
  f.deps.logger!.info = () => {
    throw failure;
  };
  const result = await f.apply({
    decision: "allow",
    permissionUpdates: grantUpdate(),
    sessionPermissionUpdates: grantUpdate(),
  });
  assert.equal(result?.error?.type, CoreErrorType.StorageError);
  assert.equal(f.writes.length, 1);
  assert.equal(f.sessionGrants.length, 0);
});

test("session service and log failures escape without rolling back completed ownership changes", async () => {
  for (const phase of ["service", "log"]) {
    const f = grantFixture(),
      failure = { phase };
    if (phase === "service")
      f.deps.permissionService.grantSessionPermission = () => {
        throw failure;
      };
    else
      f.deps.logger!.info = (message) => {
        if (message === "Session permission granted") throw failure;
      };
    await assert.rejects(
      f.apply({
        decision: "allow",
        permissionUpdates: grantUpdate(),
        sessionPermissionUpdates: grantUpdate(),
      }),
      (error) => error === failure,
    );
    assert.equal(f.writes.length, 1);
    assert.equal(f.sessionGrants.length, phase === "log" ? 1 : 0);
  }
});

test("absent session logger leaves trace and count metadata unread", async () => {
  const f = grantFixture();
  f.deps.logger = undefined;
  Object.defineProperty(f.trace, "traceId", {
    get() {
      throw new Error("unread trace");
    },
  });
  let reads = 0;
  const updates = grantUpdate();
  assert.equal(
    await f.apply({
      decision: "allow",
      get sessionPermissionUpdates() {
        reads++;
        return updates;
      },
    }),
    undefined,
  );
  assert.equal(reads, 2);
  assert.equal(f.sessionGrants[0], updates);
});
