// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, type PermissionBrokerRequest } from "@knorvia/contracts";
import { DenyPermissionBroker, ManualPermissionBroker } from "../src/permission/broker.js";

function request(id = "fixture-request"): PermissionBrokerRequest {
  return {
    requestId: id,
    sessionId: "fixture-session" as PermissionBrokerRequest["sessionId"],
    traceId: "fixture-trace" as PermissionBrokerRequest["traceId"],
    toolCallId: "fixture-call" as PermissionBrokerRequest["toolCallId"],
    toolName: "Fixture",
    input: {},
    mode: "build",
    ruleId: "fixture",
    reason: "fixture approval",
    riskLevel: "low",
    requestedAt: new Date(0),
  };
}

test("manual preparation binds one answer route without notifying until activation", async () => {
  const notices: PermissionBrokerRequest[] = [],
    input = request();
  const broker = new ManualPermissionBroker({
    onRequest: (value) => {
      notices.push(value);
    },
  });
  const handle = await broker.preparePermission(input);
  assert.equal(broker.getPendingRequest(input.requestId), input);
  assert.deepEqual(notices, []);
  handle.activate();
  handle.activate();
  assert.deepEqual(notices, [input]);
  const resolvedAt = new Date(1);
  assert.equal(broker.resolvePermission(input.toolCallId, { decision: "allow", resolvedAt }), true);
  assert.equal((await handle.result).resolvedAt, resolvedAt);
  handle.dispose();
  assert.deepEqual(broker.listPendingRequests(), []);
});

test("answering a prepared request prevents a duplicate notification on activation", async () => {
  let notices = 0;
  const broker = new ManualPermissionBroker({
    onRequest: () => {
      notices++;
    },
  });
  const handle = await broker.preparePermission(request());
  assert.equal(broker.resolvePermission("fixture-request", { decision: "deny" }), true);
  handle.activate();
  assert.equal((await handle.result).decision, "deny");
  assert.equal(notices, 0);
});

test("dispose closes a cold request and cannot remove a replacement using the same ID", async () => {
  const broker = new ManualPermissionBroker();
  const previous = await broker.preparePermission(request());
  const rejected = assert.rejects(previous.result, { type: CoreErrorType.ToolCancelled });
  previous.dispose();
  await rejected;
  const next = await broker.preparePermission(request());
  previous.dispose();
  assert.equal(broker.listPendingRequests().length, 1);
  broker.resolvePermission("fixture-request", { decision: "allow" });
  assert.equal((await next.result).decision, "allow");
});

test("timeout starts at activation and releases the pending entry once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const broker = new ManualPermissionBroker();
  const handle = await broker.preparePermission(request(), { timeoutMs: 30 });
  t.mock.timers.tick(100);
  assert.equal(broker.listPendingRequests().length, 1);
  const rejected = assert.rejects(handle.result, { type: CoreErrorType.PermissionTimeout });
  handle.activate();
  t.mock.timers.tick(30);
  await rejected;
  assert.deepEqual(broker.listPendingRequests(), []);
  assert.equal(broker.resolvePermission("fixture-request", { decision: "allow" }), false);
});

test("parent cancellation releases a prepared or active manual request", async () => {
  for (const activate of [false, true]) {
    const broker = new ManualPermissionBroker(),
      controller = new AbortController();
    const handle = await broker.preparePermission(request(), { signal: controller.signal });
    const rejected = assert.rejects(handle.result, { type: CoreErrorType.ToolCancelled });
    if (activate) handle.activate();
    controller.abort();
    await rejected;
    assert.deepEqual(broker.listPendingRequests(), []);
  }
});

test("already cancelled requests and duplicate IDs reject before notification", async () => {
  const broker = new ManualPermissionBroker(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(broker.preparePermission(request(), { signal: controller.signal }), {
    type: CoreErrorType.ToolCancelled,
  });
  const handle = await broker.preparePermission(request());
  await assert.rejects(broker.preparePermission(request()), {
    type: CoreErrorType.InvalidStateTransition,
  });
  const rejected = assert.rejects(handle.result);
  handle.dispose();
  await rejected;
});

test("synchronous notification errors reject the answer and leave no registered request", async () => {
  const failure = { fixture: "notification failed" };
  const broker = new ManualPermissionBroker({
    onRequest: () => {
      throw failure;
    },
  });
  const handle = await broker.preparePermission(request());
  const rejected = assert.rejects(handle.result, (error) => error === failure);
  handle.activate();
  await rejected;
  assert.deepEqual(broker.listPendingRequests(), []);
});

test("one-step manual and deny entrypoints use the same prepared lifecycle", async () => {
  const broker = new ManualPermissionBroker({
    onRequest: (value) => {
      broker.resolvePermission(value.requestId, { decision: "allow" });
    },
  });
  assert.equal((await broker.requestPermission(request())).decision, "allow");
  const deny = new DenyPermissionBroker();
  const handle = await deny.preparePermission(request());
  let settled = false;
  void handle.result.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  handle.activate();
  assert.equal((await handle.result).decision, "deny");
  assert.equal((await deny.requestPermission(request())).decision, "deny");
});
