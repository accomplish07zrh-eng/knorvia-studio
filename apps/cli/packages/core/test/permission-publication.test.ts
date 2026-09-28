// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { DenyPermissionBroker, ManualPermissionBroker } from "../src/permission/broker.js";
import { permissionFlow } from "./permission-flow-fixture.js";
import { gate } from "./tool-invocation-fixture.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("parent cancellation ends a blocked Requested publication and late completion cannot notify", async () => {
  const f = permissionFlow(),
    publishing = gate(),
    release = gate();
  let notifications = 0;
  const broker = new ManualPermissionBroker({
    onRequest() {
      notifications++;
    },
  });
  f.deps.permissionBroker = broker;
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionRequested) {
      publishing.resolve();
      await release.promise;
    }
  };
  let completed = false;
  const pending = f.resolve().then((value) => {
    completed = true;
    return value;
  });
  try {
    await publishing.promise;
    f.controller.abort();
    await tick();
    assert.equal(completed, true, "cancel must not wait for an uncooperative event publisher");
    const result = await pending;
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.result.error?.type, CoreErrorType.ToolCancelled);
    assert.deepEqual(broker.listPendingRequests(), []);
    assert.equal(notifications, 0);
    release.resolve();
    await tick();
    assert.equal(notifications, 0);
    assert.equal(
      f.events.filter((event) => event.type === SessionEventType.PermissionResolved).length,
      0,
    );
  } finally {
    release.resolve();
    f.controller.abort();
    await pending;
  }
});

test("publication failure releases preparation and preserves the original failure", async () => {
  const f = permissionFlow(),
    failure = new Error("fixture publication failure");
  let notifications = 0;
  const broker = new ManualPermissionBroker({
    onRequest() {
      notifications++;
    },
  });
  f.deps.permissionBroker = broker;
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionRequested) throw failure;
  };
  await assert.rejects(f.resolve(), (error) => error === failure);
  assert.deepEqual(broker.listPendingRequests(), []);
  assert.equal(notifications, 0);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.PermissionRequested],
  );
});

test("preparation failure publishes neither request nor a fictional resolution", async () => {
  const f = permissionFlow();
  f.deps.permissionBroker.preparePermission = async () => {
    throw new Error("fixture preparation failure");
  };
  const result = await f.resolve();
  assert.equal(result.allowed, false);
  assert.deepEqual(f.events, []);
});

test("answer during publication prevents Hook and legacy notification from competing afterward", async () => {
  const f = permissionFlow();
  let notifications = 0;
  const broker = new ManualPermissionBroker({
    onRequest() {
      notifications++;
    },
  });
  f.deps.permissionBroker = broker;
  f.behavior.event = async (event) => {
    if (event.type === SessionEventType.PermissionRequested) {
      const pending = broker.listPendingRequests();
      assert.equal(pending.length, 1);
      broker.resolvePermission(pending[0].requestId, { decision: "allow" });
    }
  };
  const result = await f.resolve();
  assert.equal(result.allowed, true);
  assert.equal(notifications, 0);
  assert.equal(f.observed.hooks.length, 0);
});

test("terminal activation retains the PermissionRequest Hook start contract", async () => {
  const f = permissionFlow();
  f.deps.permissionBroker = new DenyPermissionBroker();
  const result = await f.resolve();
  assert.equal(result.allowed, false);
  assert.equal(f.observed.hooks.length, 1);
});

test("cancellation after an early answer still stops a blocked publisher and observes its late failure", async () => {
  const f = permissionFlow(),
    publishing = gate(),
    release = gate();
  let notifications = 0;
  const broker = new ManualPermissionBroker({
    onRequest() {
      notifications++;
    },
  });
  f.deps.permissionBroker = broker;
  f.behavior.event = async (event) => {
    if (event.type !== SessionEventType.PermissionRequested) return;
    broker.resolvePermission(broker.listPendingRequests()[0].requestId, { decision: "allow" });
    publishing.resolve();
    await release.promise;
  };
  const pending = f.resolve();
  await publishing.promise;
  f.controller.abort();
  const result = await pending;
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.result.error?.type, CoreErrorType.ToolCancelled);
  release.reject(new Error("fixture late publisher failure"));
  await tick();
  assert.equal(notifications, 0);
  assert.equal(f.observed.hooks.length, 0);
  assert.deepEqual(broker.listPendingRequests(), []);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.PermissionRequested],
  );
});
