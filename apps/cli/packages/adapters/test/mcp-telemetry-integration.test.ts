// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import { bounded, deferred, fixture, salted, type Trees } from "./mcp-telemetry.fixture.js";

test("tracker entries feed distinct local memory events and globally deduplicated resource groups", async () => {
  const h = await fixture(true);
  const tracker = h.makeTracker();
  h.trackerOptions.onResourceSamples = () => {
    assert.fail("later outer sink replacement must not replace the sampler's shallow-copied sink");
  };
  tracker.registerConnection({
    connectionId: "builtin",
    isolation: "workspace",
    serverName: "node_repl",
  });
  tracker.acquireOwner({ connectionId: "builtin", ownerId: "a", sessionId: "shared" });
  tracker.acquireOwner({ connectionId: "builtin", ownerId: "b", sessionId: "shared" });
  tracker.acquireOwner({ connectionId: "builtin", ownerId: "undefined" });
  tracker.recordProcessStarted({ connectionId: "builtin", pid: 11 });
  tracker.registerConnection({
    connectionId: "plugin",
    isolation: "session",
    serverName: "plugin: Owned :tool",
  });
  tracker.recordProcessStarted({ connectionId: "plugin", pid: 22 });
  h.time = 61001;
  h.trees = new Map([
    [
      11,
      [
        { pid: 11, rssKb: 10, cpuTimeMs: 100 },
        { pid: 90, rssKb: 20, cpuTimeMs: 40 },
      ],
    ],
    [
      22,
      [
        { pid: 90, rssKb: 999, cpuTimeMs: 999 },
        { pid: 22, rssKb: 7, cpuTimeMs: 50 },
      ],
    ],
  ]);
  await tracker.sampleNow();
  const memories = h.events.filter((event) => event.kind === "memory");
  assert.equal(memories.length, 2);
  assert.deepEqual(
    memories.map((event) => [
      event.memoryKb,
      event.ownerSessionCount,
      event.orphanSuspected,
      event.unownedSeconds,
    ]),
    [
      [30, 1, false, 0],
      [1006, 0, true, 60.001],
    ],
  );
  assert.deepEqual(
    h.groups[0]?.map((sample) => [sample.mcpId, sample.processCount, sample.rssKbTotal]),
    [
      ["builtin:node_repl", 2, 30],
      [`plugin:${salted("plugin: Owned :tool")}`, 1, 7],
    ],
  );
  assert.equal(h.groups[0]?.[0]?.instanceToken, h.groups[0]?.[1]?.instanceToken);
  assert.equal(h.count("native.uuid"), 1);
  assert.equal(h.count("randomId"), 2);
  assert.equal(h.groupReceivers[0], h.resourceInput);
  assert.notEqual(h.groupReceivers[0], h.trackerOptions);
  assert.deepEqual(tracker.listProcesses(), [
    { pid: 11, serverName: "node_repl", mcpSource: "builtin" },
    { pid: 22, serverName: "plugin: Owned :tool", mcpSource: "plugin", pluginName: "Owned" },
  ]);
});

test("a process replaced while the probe waits invalidates the captured identity", async (t) => {
  const h = await fixture(true);
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  tracker.recordProcessStarted({ connectionId: "c", pid: 11 });
  const gate = deferred<Trees>();
  h.probe.sampleProcessTrees = async () => gate.promise;
  const first = tracker.sampleNow();
  t.after(() => gate.resolve(new Map()));
  tracker.recordProcessStarted({ connectionId: "c", pid: 22 });
  gate.resolve(new Map([[11, [{ pid: 11, rssKb: 999, cpuTimeMs: 999 }]]]));
  await bounded(first, "stale process probe");
  assert.equal(h.events.filter((event) => event.kind === "memory").length, 0);
  assert.equal(h.groups.length, 0);
  h.time = 1200;
  h.probe.sampleProcessTrees = async () => new Map([[22, [{ pid: 22, rssKb: 3, cpuTimeMs: 40 }]]]);
  await tracker.sampleNow();
  const memory = h.events.at(-1);
  assert.ok(memory?.kind === "memory");
  assert.equal(memory.mcpInstanceId, "owned-instance-2");
  assert.equal(memory.memoryKb, 3);
  assert.equal(h.groups[0]?.[0]?.cpuTimeMsDelta, 0);
  assert.equal(h.groups[0]?.[0]?.intervalMs, 200);
});

test("unregistered retained processes stay eligible and use the timestamp captured before probe await", async (t) => {
  const h = await fixture(true);
  const tracker = h.makeTracker();
  tracker.registerConnection({ connectionId: "c", isolation: "session", serverName: "node_repl" });
  tracker.acquireOwner({ connectionId: "c", ownerId: "owner", sessionId: "session" });
  tracker.recordProcessStarted({ connectionId: "c", pid: 11 });
  const gate = deferred<Trees>();
  h.probe.sampleProcessTrees = async () => gate.promise;
  h.time = 2000;
  const first = tracker.sampleNow();
  t.after(() => gate.resolve(new Map()));
  h.time = 95000;
  tracker.unregisterConnection({ connectionId: "c" });
  gate.resolve(new Map([[11, [{ pid: 11, rssKb: 4 }]]]));
  await bounded(first, "retained orphan probe");
  const memory = h.events.at(-1);
  assert.ok(memory?.kind === "memory");
  assert.equal(memory.occurredAt, 2000);
  assert.equal(memory.ownerSessionCount, 0);
  assert.equal(memory.unownedSeconds, 0);
  assert.equal(memory.orphanSuspected, false);
  assert.equal(h.groups[0]?.[0]?.sampledAt, 2000);
  assert.equal(tracker.listProcesses().length, 1);
  h.probe.sampleProcessTrees = async () => new Map();
  await tracker.sampleNow();
  assert.deepEqual(tracker.listProcesses(), []);
  assert.equal(h.groups.length, 1);
});
