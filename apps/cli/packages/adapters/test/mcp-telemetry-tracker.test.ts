// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { deferred, fixture, salted } from "./mcp-telemetry.fixture.js";

test("tracker surface and sampler delegation preserve captured defaults and a shallow projection", async () => {
  const h = await fixture();
  h.trackerOptions.arch = undefined;
  h.trackerOptions.platform = undefined;
  h.trackerOptions.now = undefined;
  const marker = {};
  Object.assign(h.trackerOptions, {
    marker,
    getProcesses: () => {
      assert.fail("external process owner must be replaced");
    },
  });
  const tracker = h.makeTracker();
  assert.equal(h.trackerApi.createMcpTelemetryTracker.length, 1);
  assert.equal(h.trackerApi.resolvePluginName.length, 1);
  assert.deepEqual(Object.keys(tracker), [
    "acquireOwner",
    "recordProcessCrashed",
    "recordProcessClosed",
    "recordProcessStarted",
    "recordSessionStartup",
    "releaseOwner",
    "registerConnection",
    "unregisterConnection",
    "listProcesses",
    "sampleNow",
    "start",
    "stop",
  ]);
  for (const [name, method] of Object.entries(tracker))
    assert.equal(
      method.length,
      ["listProcesses", "sampleNow", "start", "stop"].includes(name) ? 0 : 1,
      name,
    );
  assert.equal(tracker.sampleNow, h.stubSampler.sampleNow);
  assert.equal(tracker.start, h.stubSampler.start);
  assert.equal(tracker.stop, h.stubSampler.stop);
  assert.notEqual(h.resourceInput, h.trackerOptions);
  assert.equal((h.resourceInput as typeof h.resourceInput & { marker: object }).marker, marker);
  assert.equal(h.resourceInput.arch, "arm64");
  assert.equal(h.resourceInput.platform, "linux");
  assert.deepEqual(h.resourceInput.getProcesses(), []);
  assert.equal(h.count("interval.set"), 0);
  assert.equal(h.count("stub.sample"), 0);
  h.trackerOptions.arch = "x64";
  h.trackerOptions.platform = "win32";
  h.trackerOptions.now = () => 999999;
  tracker.recordSessionStartup({
    configuredCount: 1,
    connectedCount: 2,
    failedCount: 3,
    processCount: 4,
    sessionId: "session",
  });
  assert.deepEqual(h.events[0], {
    arch: "arm64",
    configuredCount: 1,
    connectedCount: 2,
    failedCount: 3,
    kind: "session_startup",
    occurredAt: 1000,
    platform: "linux",
    processCount: 4,
    sessionId: "session",
  });
  assert.equal(h.count("native.now"), 1);
});

test("builtin byte escaping and nonbuiltin native HMAC retain raw names and explicit source", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  const cases = [
    { name: "node_repl", id: "builtin:node_repl", source: undefined },
    {
      name: "plugin:包:tool/空::\ud800",
      id: "builtin:%E5%8C%85:tool%2F%E7%A9%BA::%EF%BF%BD",
      source: "builtin" as const,
    },
    { name: "a:!*'()~._-", id: "builtin:a:%21%2A%27%28%29~._-", source: "builtin" as const },
    { name: "plugin: Name :key", id: `plugin:${salted("plugin: Name :key")}`, source: undefined },
    { name: " node_repl", id: `custom:${salted(" node_repl")}`, source: undefined },
    {
      name: "plugin:Name:key",
      id: `custom:${salted("plugin:Name:key")}`,
      source: "custom" as const,
    },
  ];
  for (const [index, item] of cases.entries()) {
    const connectionId = String(index);
    tracker.registerConnection({
      connectionId,
      isolation: "workspace",
      serverName: item.name,
      source: item.source,
    });
    const identity = tracker.recordProcessStarted({ connectionId, pid: index + 1 });
    assert.ok(identity);
    assert.deepEqual(Object.keys(identity), ["mcpId", "mcpInstanceId"]);
    assert.equal(identity.mcpId, item.id);
    assert.equal(Object.getPrototypeOf(identity), Object.prototype);
  }
  h.trackerOptions.idSalt = "new-salt";
  tracker.registerConnection({ connectionId: "salt", isolation: "session", serverName: "raw" });
  assert.equal(
    tracker.recordProcessStarted({ connectionId: "salt", pid: 99 })?.mcpId,
    `custom:${salted("raw", "new-salt")}`,
  );
  assert.deepEqual(
    tracker.listProcesses().find((row) => row.pid === 6),
    { pid: 6, serverName: "plugin:Name:key", mcpSource: "custom", pluginName: "Name" },
  );
});

test("plugin-name resolution is exact-prefix, one segment and trim only", async () => {
  const h = await fixture();
  for (const [name, expected] of [
    ["plugin: One :rest:more", "One"],
    ["plugin:solo", "solo"],
    ["plugin::key", undefined],
    ["plugin:   :key", undefined],
    ["Plugin:name:key", undefined],
    [" plugin:name:key", undefined],
    ["node_repl", undefined],
  ] as const)
    assert.equal(h.trackerApi.resolvePluginName(name), expected);
});

test("missing registrations and invalid PIDs do not consume identities clocks or events", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  for (const pid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(tracker.recordProcessStarted({ connectionId: "c", pid }), undefined);
  assert.equal(tracker.recordProcessStarted({ connectionId: "missing", pid: 1 }), undefined);
  tracker.acquireOwner({ connectionId: "missing", ownerId: "x" });
  tracker.releaseOwner({ connectionId: "c", ownerId: "absent" });
  tracker.recordProcessCrashed({ connectionId: "missing", exitCode: null, signal: null });
  tracker.recordProcessClosed({ connectionId: "missing" });
  tracker.unregisterConnection({ connectionId: "missing" });
  assert.equal(h.count("randomId"), 0);
  assert.equal(h.count("now"), 0);
  assert.deepEqual(h.events, []);
  const id = tracker.recordProcessStarted({ connectionId: "c", pid: 7 });
  assert.deepEqual(id, { mcpId: "builtin:node_repl", mcpInstanceId: "owned-instance-1" });
  assert.deepEqual(h.names().slice(-3), ["randomId", "now", "event"]);
  assert.deepEqual(h.events[0], {
    arch: "x64",
    kind: "process_start",
    mcpId: "builtin:node_repl",
    mcpInstanceId: "owned-instance-1",
    mcpIsolation: "session",
    mcpSource: "builtin",
    occurredAt: 1000,
    platform: "win32",
  });
  assert.deepEqual(Object.keys(h.events[0]!), [
    "arch",
    "kind",
    "mcpId",
    "mcpInstanceId",
    "mcpIsolation",
    "mcpSource",
    "occurredAt",
    "platform",
  ]);
});

test("shared, empty and undefined owner sessions keep distinct ownership and crash counts", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  tracker.registerConnection({
    connectionId: "c",
    isolation: "workspace",
    serverName: "node_repl",
  });
  for (const [ownerId, sessionId] of [
    ["a", "same"],
    ["b", "same"],
    ["empty", ""],
    ["undefined", undefined],
  ] as const)
    tracker.acquireOwner({ connectionId: "c", ownerId, sessionId });
  tracker.recordProcessStarted({ connectionId: "c", pid: 7 });
  h.time = 400;
  tracker.recordProcessCrashed({ connectionId: "c", exitCode: null, signal: "SIGTERM" });
  assert.deepEqual(h.events[1], {
    affectedSessionCount: 2,
    arch: "x64",
    exitCode: null,
    kind: "process_crash",
    mcpId: "builtin:node_repl",
    mcpInstanceId: "owned-instance-1",
    mcpIsolation: "workspace",
    mcpSource: "builtin",
    occurredAt: 400,
    platform: "win32",
    signal: "SIGTERM",
    uptimeMs: 0,
  });
  assert.deepEqual(Object.keys(h.events[1]!), [
    "affectedSessionCount",
    "arch",
    "exitCode",
    "kind",
    "mcpId",
    "mcpInstanceId",
    "mcpIsolation",
    "mcpSource",
    "occurredAt",
    "platform",
    "signal",
    "uptimeMs",
  ]);
  tracker.recordProcessCrashed({ connectionId: "c", exitCode: 1, signal: null });
  assert.equal(h.events.length, 2);
  assert.deepEqual(tracker.listProcesses(), []);
  assert.equal(
    tracker.recordProcessStarted({ connectionId: "c", pid: 8 })?.mcpInstanceId,
    "owned-instance-2",
  );
  tracker.recordProcessClosed({ connectionId: "c" });
  assert.ok(tracker.recordProcessStarted({ connectionId: "c", pid: 9 }));
});

test("owner release and unregister preserve live orphan observation with a strict sixty-second threshold", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  tracker.acquireOwner({ connectionId: "c", ownerId: "owner" });
  tracker.recordProcessStarted({ connectionId: "c", pid: 11 });
  const observed = h.resourceInput.getProcesses()[0];
  assert.ok(observed);
  h.time = 2000;
  tracker.releaseOwner({ connectionId: "c", ownerId: "owner" });
  h.time = 9000;
  tracker.unregisterConnection({ connectionId: "c" });
  assert.equal(observed.isCurrent(), true);
  observed.observed(
    [
      { pid: 11, rssKb: 7 },
      { pid: 11, rssKb: 9 },
    ],
    62000,
    "direct_process",
  );
  observed.observed([], 62001, "process_tree");
  const memories = h.events.filter((event) => event.kind === "memory");
  assert.equal(memories.length, 2);
  assert.deepEqual(memories[0], {
    arch: "x64",
    kind: "memory",
    mcpId: "builtin:node_repl",
    mcpInstanceId: "owned-instance-1",
    mcpIsolation: "session",
    mcpSource: "builtin",
    platform: "win32",
    occurredAt: 62000,
    memoryKb: 16,
    memoryScope: "direct_process",
    orphanSuspected: false,
    ownerSessionCount: 0,
    unownedSeconds: 60,
  });
  assert.equal(memories[1]?.memoryKb, 0);
  assert.equal(memories[1]?.orphanSuspected, true);
  assert.equal(memories[1]?.unownedSeconds, 60.001);
  assert.deepEqual(Object.keys(memories[0]!), [
    "arch",
    "kind",
    "mcpId",
    "mcpInstanceId",
    "mcpIsolation",
    "mcpSource",
    "platform",
    "occurredAt",
    "memoryKb",
    "memoryScope",
    "orphanSuspected",
    "ownerSessionCount",
    "unownedSeconds",
  ]);
  observed.observed(undefined, 63000, "process_tree");
  assert.deepEqual(tracker.listProcesses(), []);
  assert.equal(tracker.recordProcessStarted({ connectionId: "c", pid: 12 }), undefined);
});

test("undefined-session owners prevent missing-tree deletion and reacquisition resets orphan time", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "custom" });
  tracker.recordProcessStarted({ connectionId: "c", pid: 1 });
  h.time = 90000;
  tracker.acquireOwner({ connectionId: "c", ownerId: "owner" });
  const observed = h.resourceInput.getProcesses()[0];
  assert.ok(observed);
  observed.observed(undefined, h.time, "process_tree");
  assert.equal(tracker.listProcesses().length, 1);
  observed.observed([], h.time, "process_tree");
  const owned = h.events.at(-1);
  assert.ok(owned?.kind === "memory");
  assert.equal(owned.ownerSessionCount, 0);
  assert.equal(owned.unownedSeconds, 0);
  assert.equal(owned.orphanSuspected, false);
  h.time = 100000;
  tracker.releaseOwner({ connectionId: "c", ownerId: "owner" });
  observed.observed([], 100500, "process_tree");
  const released = h.events.at(-1);
  assert.ok(released?.kind === "memory");
  assert.equal(released.unownedSeconds, 0.5);
});

test("replacement invalidates captured entries and retains registration order without implicit events", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  for (const [connectionId, pid] of [
    ["a", 1],
    ["b", 2],
  ] as const) {
    tracker.registerConnection({ connectionId, isolation: "workspace", serverName: connectionId });
    tracker.recordProcessStarted({ connectionId, pid });
  }
  const old = h.resourceInput.getProcesses()[0];
  assert.ok(old);
  tracker.registerConnection({
    connectionId: "a",
    isolation: "session",
    serverName: "replacement",
  });
  assert.equal(old.isCurrent(), false);
  assert.equal(h.events.length, 2);
  tracker.recordProcessStarted({ connectionId: "a", pid: 3 });
  const prior = h.resourceInput.getProcesses()[0];
  assert.ok(prior);
  tracker.recordProcessStarted({ connectionId: "a", pid: 4 });
  assert.equal(prior.isCurrent(), false);
  const list = tracker.listProcesses();
  assert.deepEqual(
    list.map((row) => row.pid),
    [4, 2],
  );
  assert.notEqual(list, tracker.listProcesses());
  assert.notEqual(list[0], tracker.listProcesses()[0]);
  tracker.recordProcessClosed({ connectionId: "a" });
  assert.equal(tracker.recordProcessStarted({ connectionId: "a", pid: 5 }), undefined);
});

test("live event sinks ignore synchronous failure and returned promises while retaining state", async () => {
  const h = await fixture();
  const tracker = h.makeTracker();
  const gate = deferred<void>();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  h.trackerOptions.onEvent = function () {
    assert.equal(this, h.trackerOptions);
    throw new Error("sink");
  };
  assert.ok(tracker.recordProcessStarted({ connectionId: "c", pid: 1 }));
  assert.equal(tracker.listProcesses().length, 1);
  let delivered = 0;
  h.trackerOptions.onEvent = function () {
    assert.equal(this, h.trackerOptions);
    delivered += 1;
    return gate.promise;
  };
  tracker.recordProcessCrashed({ connectionId: "c", exitCode: 9, signal: null });
  assert.equal(delivered, 1);
  assert.deepEqual(tracker.listProcesses(), []);
  gate.resolve();
});

test("clock errors outside the sink keep an already-cleared crash process", async () => {
  const h = await fixture();
  const reason = new Error("clock failed");
  let fail = false;
  h.trackerOptions.now = () => {
    if (fail) throw reason;
    return h.time;
  };
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  tracker.recordProcessStarted({ connectionId: "c", pid: 1 });
  fail = true;
  assert.throws(
    () => tracker.recordProcessCrashed({ connectionId: "c", exitCode: null, signal: null }),
    (error) => error === reason,
  );
  assert.deepEqual(tracker.listProcesses(), []);
  assert.equal(h.events.length, 1);
  fail = false;
  assert.ok(tracker.recordProcessStarted({ connectionId: "c", pid: 2 }));
});
