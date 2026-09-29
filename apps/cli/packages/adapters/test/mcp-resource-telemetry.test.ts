// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import test from "node:test";
import {
  bounded,
  deferred,
  entry,
  fixture,
  rejection,
  type Trees,
} from "./mcp-telemetry.fixture.js";

test("resource construction resolves owned defaults once and has no automatic sampling", async () => {
  const h = await fixture();
  h.resourceOptions.processProbe = undefined;
  h.resourceOptions.logicalCpuCount = undefined;
  h.resourceOptions.totalMemoryGb = undefined;
  h.resourceOptions.timer = undefined;
  const sampler = h.makeResource();
  assert.equal(h.resourceApi.createMcpResourceTelemetry.length, 1);
  assert.deepEqual(Object.keys(sampler), ["sampleNow", "start", "stop"]);
  for (const method of Object.values(sampler)) assert.equal(method.length, 0);
  assert.deepEqual(h.names(), ["probe.create", "os.cpus", "os.totalmem", "native.uuid"]);
  assert.deepEqual(h.calls[0]?.args, [{ platform: "win32" }]);
  h.processes = [entry()];
  h.trees = new Map([[11, [{ pid: 11, rssKb: 4 }]]]);
  await sampler.sampleNow();
  const sample = h.groups[0]?.[0];
  assert.ok(sample);
  assert.equal(sample.logicalCpuCount, 4);
  assert.equal(sample.totalMemoryGb, 8);
  assert.match(sample.instanceToken, /^[0-9a-f-]{36}$/);
  assert.equal(h.count("probe.sample"), 1);
  assert.equal(h.count("interval.set"), 0);
  sampler.start();
  assert.equal(h.count("interval.set"), 1);
  assert.equal(h.count("probe.sample"), 1);
});

test("supplied zero capacity is preserved and native-default failure is synchronous", async () => {
  const h = await fixture();
  h.resourceOptions.logicalCpuCount = 0;
  h.resourceOptions.totalMemoryGb = 0;
  h.processes = [entry()];
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1 }]]]);
  const sampler = h.makeResource();
  h.resourceOptions.logicalCpuCount = 99;
  h.resourceOptions.totalMemoryGb = 99;
  h.resourceOptions.arch = "arm64";
  h.resourceOptions.platform = "linux";
  await sampler.sampleNow();
  assert.equal(h.groups[0]?.[0]?.logicalCpuCount, 0);
  assert.equal(h.groups[0]?.[0]?.totalMemoryGb, 0);
  assert.equal(h.groups[0]?.[0]?.arch, "arm64");
  assert.equal(h.groups[0]?.[0]?.platform, "linux");
  assert.equal(h.count("os.cpus"), 0);
  assert.equal(h.count("os.totalmem"), 0);
  const other = await fixture();
  const reason = new Error("owned CPU metadata failed");
  other.resourceOptions.logicalCpuCount = undefined;
  other.os.cpus = () => {
    throw reason;
  };
  assert.throws(
    () => other.makeResource(),
    (error) => error === reason,
  );
});

test("one ordered probe, global PID precedence and duplicate-only uptime produce ordered groups", async () => {
  const h = await fixture();
  h.time = 180000;
  const observed: number[] = [];
  h.processes = [
    entry({
      observed: () => {
        observed.push(11);
      },
    }),
    entry({
      instanceId: "B",
      mcpId: "custom:b",
      pid: 22,
      startedAt: 60000,
      observed: () => {
        observed.push(22);
      },
    }),
    entry({
      instanceId: "C",
      pid: 33,
      startedAt: -60000,
      observed: () => {
        observed.push(33);
      },
    }),
  ];
  h.trees = new Map([
    [
      11,
      [
        { pid: 11, rssKb: 10, cpuTimeMs: 100 },
        { pid: 90, rssKb: 20, cpuTimeMs: 200 },
      ],
    ],
    [
      22,
      [
        { pid: 90, rssKb: 999, cpuTimeMs: 999 },
        { pid: 22, rssKb: 7, cpuTimeMs: 50 },
      ],
    ],
    [33, [{ pid: 11, rssKb: 999, cpuTimeMs: 999 }]],
  ]);
  const sampler = h.makeResource();
  await sampler.sampleNow();
  assert.deepEqual(h.calls.find((call) => call.name === "probe.sample")?.args, [[11, 22, 33]]);
  assert.deepEqual(observed, [11, 22, 33]);
  assert.equal(h.count("probe.reset"), 1);
  assert.equal(h.count("now"), 1);
  const samples = h.groups[0];
  assert.ok(samples);
  assert.equal(samples.length, 2);
  const token = samples[0]!.instanceToken;
  assert.deepEqual(samples, [
    {
      mcpId: "custom:a",
      instanceToken: token,
      sampledAt: 180000,
      intervalMs: 300000,
      processCount: 2,
      rssKbTotal: 30,
      rssKbMaxProcess: 20,
      cpuTimeMsDelta: 0,
      uptimeMinutes: 4,
      platform: "win32",
      arch: "x64",
      logicalCpuCount: 4,
      totalMemoryGb: 8,
    },
    {
      mcpId: "custom:b",
      instanceToken: token,
      sampledAt: 180000,
      intervalMs: 300000,
      processCount: 1,
      rssKbTotal: 7,
      rssKbMaxProcess: 7,
      cpuTimeMsDelta: 0,
      uptimeMinutes: 2,
      platform: "win32",
      arch: "x64",
      logicalCpuCount: 4,
      totalMemoryGb: 8,
    },
  ]);
  assert.deepEqual(Object.keys(samples[0]!), [
    "mcpId",
    "instanceToken",
    "sampledAt",
    "intervalMs",
    "processCount",
    "rssKbTotal",
    "rssKbMaxProcess",
    "cpuTimeMsDelta",
    "uptimeMinutes",
    "platform",
    "arch",
    "logicalCpuCount",
    "totalMemoryGb",
  ]);
  assert.equal(Object.getPrototypeOf(samples[0]), Object.prototype);
  assert.equal(h.groupReceivers[0], h.resourceOptions);
  h.time = 180100;
  h.trees = new Map([
    [
      11,
      [
        { pid: 11, rssKb: 10, cpuTimeMs: 105 },
        { pid: 90, rssKb: 20, cpuTimeMs: 190 },
      ],
    ],
    [
      22,
      [
        { pid: 90, rssKb: 999, cpuTimeMs: 1000 },
        { pid: 22, rssKb: 7, cpuTimeMs: 70 },
      ],
    ],
    [33, [{ pid: 11, rssKb: 999, cpuTimeMs: 1000 }]],
  ]);
  await sampler.sampleNow();
  assert.deepEqual(
    h.groups[1]?.map((sample) => [sample.cpuTimeMsDelta, sample.intervalMs]),
    [
      [5, 100],
      [20, 100],
    ],
  );
  h.time = 180200;
  h.trees = new Map([
    [
      22,
      [
        { pid: 90, rssKb: 20, cpuTimeMs: 210 },
        { pid: 22, rssKb: 7, cpuTimeMs: 75 },
      ],
    ],
    [33, [{ pid: 11, rssKb: 10, cpuTimeMs: 120 }]],
  ]);
  await sampler.sampleNow();
  assert.deepEqual(
    h.groups[2]?.map((sample) => [sample.mcpId, sample.cpuTimeMsDelta]),
    [
      ["custom:b", 5],
      ["custom:a", 0],
    ],
  );
});

test("duplicate roots are submitted intact and isCurrent and observed control each entry", async () => {
  const h = await fixture();
  const seen: unknown[] = [];
  const row = [{ pid: 11, rssKb: 3 }];
  h.processes = [
    entry({
      isCurrent() {
        seen.push("stale");
        return false;
      },
      observed() {
        assert.fail("stale entry observed");
      },
    }),
    entry({
      instanceId: "current",
      isCurrent() {
        seen.push("current");
        return true;
      },
      observed(tree, at, scope) {
        seen.push([tree, at, scope]);
      },
    }),
  ];
  h.trees = new Map([[11, row]]);
  await h.makeResource().sampleNow();
  assert.deepEqual(h.calls.find((call) => call.name === "probe.sample")?.args, [[11, 11]]);
  assert.deepEqual(seen, ["stale", "current", [row, 1000, "process_tree"]]);
  assert.equal((seen[2] as unknown[])[0], row);
  assert.equal(h.groups[0]?.[0]?.processCount, 1);
});

test("CPU baselines distinguish missing values, counter reset, replacement identity and clock rollback", async () => {
  const h = await fixture();
  h.processes = [entry()];
  const sampler = h.makeResource();
  for (const [time, cpu, expected] of [
    [1000, 100, 0],
    [900, 90, 0],
    [1000, 95, 5],
    [1100, undefined, 0],
    [1200, 500, 0],
  ] as const) {
    h.time = time;
    h.trees = new Map([
      [11, [{ pid: 11, rssKb: 1, ...(cpu === undefined ? {} : { cpuTimeMs: cpu }) }]],
    ]);
    await sampler.sampleNow();
    assert.equal(h.groups.at(-1)?.[0]?.cpuTimeMsDelta, expected);
  }
  assert.equal(h.groups[1]?.[0]?.intervalMs, 1);
  h.processes = [entry({ instanceId: "new" })];
  h.time = 1300;
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 800 }]]]);
  await sampler.sampleNow();
  assert.equal(h.groups.at(-1)?.[0]?.cpuTimeMsDelta, 0);
});

test("empty Map advances the window, absent probe and empty process list reset it", async () => {
  const h = await fixture();
  const observed: unknown[] = [];
  h.processes = [
    entry({
      observed: (rows) => {
        observed.push(rows);
      },
    }),
  ];
  const sampler = h.makeResource();
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 10 }]]]);
  await sampler.sampleNow();
  h.time = 1500;
  h.trees = new Map();
  await sampler.sampleNow();
  assert.equal(observed.length, 2);
  assert.equal(observed[1], undefined);
  assert.equal(h.groups.length, 1);
  h.time = 1750;
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 100 }]]]);
  await sampler.sampleNow();
  assert.equal(h.groups.at(-1)?.[0]?.intervalMs, 250);
  assert.equal(h.groups.at(-1)?.[0]?.cpuTimeMsDelta, 0);
  h.time = 2000;
  h.trees = undefined;
  await sampler.sampleNow();
  assert.equal(observed.length, 3);
  h.time = 2500;
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 110 }]]]);
  await sampler.sampleNow();
  assert.equal(h.groups.at(-1)?.[0]?.intervalMs, 300000);
  assert.equal(h.groups.at(-1)?.[0]?.cpuTimeMsDelta, 0);
  h.processes = [];
  const clocks = h.count("now");
  const probes = h.count("probe.sample");
  await sampler.sampleNow();
  assert.equal(h.count("now"), clocks);
  assert.equal(h.count("probe.sample"), probes);
  h.processes = [entry()];
  h.time = 3000;
  await sampler.sampleNow();
  assert.equal(h.groups.at(-1)?.[0]?.intervalMs, 300000);
});

test("overlap skips immediately and stop invalidates an awaited probe without unlocking it early", async (t) => {
  const h = await fixture();
  h.processes = [
    entry({
      observed() {
        h.record("observed");
      },
    }),
  ];
  const gate = deferred<Trees>();
  h.probe.sampleProcessTrees = async () => {
    h.record("probe.sample");
    return gate.promise;
  };
  const sampler = h.makeResource();
  const first = sampler.sampleNow();
  t.after(() => gate.resolve(new Map()));
  await bounded(sampler.sampleNow(), "overlapping sample skips");
  assert.equal(h.count("getProcesses"), 1);
  sampler.stop();
  sampler.start();
  await bounded(sampler.sampleNow(), "stopped in-flight still skips");
  assert.equal(h.count("getProcesses"), 1);
  gate.resolve(new Map([[11, [{ pid: 11, rssKb: 3, cpuTimeMs: 10 }]]]));
  await bounded(first, "old probe settles");
  assert.equal(h.count("observed"), 0);
  assert.equal(h.groups.length, 0);
  h.probe.sampleProcessTrees = async () => new Map([[11, [{ pid: 11, rssKb: 3, cpuTimeMs: 20 }]]]);
  await sampler.sampleNow();
  assert.equal(h.groups[0]?.[0]?.intervalMs, 300000);
  assert.equal(h.groups[0]?.[0]?.cpuTimeMsDelta, 0);
  assert.equal(h.count("native.uuid"), 1);
});

test("pre-try process-list error is retryable but a pre-try clock error keeps the in-flight limitation", async () => {
  const h = await fixture();
  const reason = new Error("before try");
  h.resourceOptions.getProcesses = () => {
    throw reason;
  };
  const sampler = h.makeResource();
  assert.equal(await rejection(sampler.sampleNow()), reason);
  h.resourceOptions.getProcesses = () => [entry()];
  h.resourceOptions.now = () => {
    throw reason;
  };
  assert.equal(await rejection(sampler.sampleNow()), reason);
  assert.equal(h.count("probe.reset"), 0);
  h.resourceOptions.now = () => 123;
  sampler.stop();
  await bounded(sampler.sampleNow(), "clock-error owner remains busy");
  assert.equal(h.count("probe.reset"), 0);
});

test("probe, observation and synchronous notification errors clear baselines without rollback", async () => {
  for (const stage of ["reset", "probe", "observed", "notify"] as const) {
    const h = await fixture();
    h.processes = [entry()];
    h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 10 }]]]);
    const sampler = h.makeResource();
    await sampler.sampleNow();
    const reason = new Error(stage);
    const originalReset = h.probe.reset;
    const originalProbe = h.probe.sampleProcessTrees;
    const originalNotify = h.resourceOptions.onResourceSamples;
    const originalObserved = h.processes[0]!.observed;
    if (stage === "reset")
      h.probe.reset = () => {
        throw reason;
      };
    if (stage === "probe")
      h.probe.sampleProcessTrees = async () => {
        throw reason;
      };
    if (stage === "observed")
      h.processes[0]!.observed = () => {
        h.record("observed.before.error");
        throw reason;
      };
    if (stage === "notify")
      h.resourceOptions.onResourceSamples = () => {
        throw reason;
      };
    h.time = 1200;
    await sampler.sampleNow();
    if (stage === "observed") assert.equal(h.count("observed.before.error"), 1);
    h.probe.reset = originalReset;
    h.probe.sampleProcessTrees = originalProbe;
    h.resourceOptions.onResourceSamples = originalNotify;
    h.processes[0]!.observed = originalObserved;
    h.time = 1300;
    h.trees = new Map([[11, [{ pid: 11, rssKb: 1, cpuTimeMs: 100 }]]]);
    await sampler.sampleNow();
    assert.equal(h.groups.at(-1)?.[0]?.cpuTimeMsDelta, 0);
    assert.equal(h.groups.at(-1)?.[0]?.intervalMs, 300000);
  }
});

test("notifications are not awaited and a stop inside observed is not a second generation fence", async () => {
  const h = await fixture();
  const notification = deferred<void>();
  h.resourceOptions.onResourceSamples = function (groups) {
    assert.equal(this, h.resourceOptions);
    h.groups.push(groups);
    return notification.promise;
  };
  const sampler = h.makeResource();
  h.processes = [
    entry({
      observed() {
        sampler.stop();
      },
    }),
  ];
  h.trees = new Map([[11, [{ pid: 11, rssKb: 1 }]]]);
  await bounded(sampler.sampleNow(), "notification is fire-and-forget");
  assert.equal(h.groups.length, 1);
  notification.resolve();
});

test("interval ownership survives unref failure and clears its handle before failed cancellation", async () => {
  const h = await fixture();
  let callback: (() => void) | undefined;
  const handle = {
    unref() {
      assert.equal(this, handle);
      h.record("interval.unref");
      throw new Error("unref");
    },
  };
  h.timer.setInterval = (next, ms) => {
    h.record("interval.set", ms);
    callback = next;
    return handle;
  };
  h.timer.clearInterval = (value) => {
    assert.equal(value, handle);
    h.record("interval.clear");
    throw new Error("clear");
  };
  const sampler = h.makeResource();
  sampler.start();
  sampler.start();
  assert.equal(h.count("interval.set"), 1);
  assert.equal(h.count("getProcesses"), 0);
  assert.deepEqual(h.calls.find((call) => call.name === "interval.set")?.args, [300000]);
  assert.ok(callback);
  callback();
  assert.equal(h.count("getProcesses"), 1);
  sampler.stop();
  sampler.start();
  assert.equal(h.count("interval.clear"), 1);
  assert.equal(h.count("interval.set"), 2);
});

test("interval creation failure is ignored and a later start can try again", async () => {
  const h = await fixture();
  const original = h.timer.setInterval;
  let attempts = 0;
  h.timer.setInterval = (callback, interval) => {
    attempts += 1;
    if (attempts === 1) throw new Error("timer unavailable");
    return original.call(h.timer, callback, interval);
  };
  const sampler = h.makeResource();
  sampler.start();
  sampler.start();
  assert.equal(attempts, 2);
  assert.equal(h.count("interval.unref"), 1);
  assert.equal(h.count("probe.sample"), 0);
});
