// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { world } from "./fixture.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { knorviaMcpResourceSamplesSchema, knorviaToolExecResourceSchema } = await import(
  require.resolve("@knorvia/shared")
);

/** 实际旧调用方消费新/旧 probe；随机标识只校验形态，不替换确定性数值断言。 */
export async function mcpFrames(loaded) {
  const w = world();
  loaded.use(w);
  let time = 1000;
  let commands = 0;
  const notices = [];
  const observed = [];
  let schemaError;
  const probe = loaded.subject.factory.createProcessProbe({
    platform: "darwin",
    execFile: async () => ({
      status: 0,
      stderr: "",
      stdout: commands++ === 0 ? "11 0 4 0:01\n12 11 3 0:02" : "11 0 5 0:02\n12 11 4 0:02.5",
    }),
  });
  const sampler = loaded.subject.mcp.createMcpResourceTelemetry({
    arch: "x64",
    platform: "darwin",
    now: () => time,
    logicalCpuCount: 4,
    totalMemoryGb: 8,
    processProbe: probe,
    timer: {
      setInterval() {
        throw new Error("Unexpected real scheduling");
      },
      clearInterval() {},
    },
    getProcesses: () => [
      {
        instanceId: "controlled-instance",
        mcpId: "builtin:controlled",
        pid: 11,
        startedAt: 0,
        isCurrent: () => true,
        observed: (samples, at, scope) =>
          observed.push({ samples: JSON.parse(JSON.stringify(samples)), at, scope }),
      },
    ],
    onResourceSamples: (samples) => {
      try {
        knorviaMcpResourceSamplesSchema.parse(samples);
      } catch (error) {
        schemaError = error;
        throw error;
      }
      notices.push(
        samples.map(({ instanceToken, ...row }) => {
          assert.equal(typeof instanceToken, "string");
          return row;
        }),
      );
    },
  });
  await sampler.sampleNow();
  time = 2000;
  await sampler.sampleNow();
  sampler.stop();
  if (schemaError) throw schemaError;
  assert.equal(commands, 2);
  assert.deepEqual(
    notices.map((x) => [x[0].rssKbTotal, x[0].cpuTimeMsDelta, x[0].intervalMs]),
    [
      [7, 0, 300000],
      [9, 1500, 1000],
    ],
  );
  assert.deepEqual(
    observed.map((x) => x.scope),
    ["process_tree", "process_tree"],
  );
  return { notices, observed };
}

export async function bashFrame(loaded) {
  const w = world();
  w.now = 0;
  let poll;
  let cancelled = false;
  const results = [];
  let commands = 0;
  w.subscribe = (interval, callback) => {
    assert.ok(interval > 0);
    poll = callback;
    return () => {
      cancelled = true;
    };
  };
  loaded.use(w);
  const probe = loaded.subject.factory.createProcessProbe({
    platform: "darwin",
    execFile: async () => ({
      status: 0,
      stderr: "",
      stdout: commands++ === 0 ? "11 4 0:01\n12 3 0:02" : "11 5 0:02\n12 4 0:02.5",
    }),
  });
  const tracker = loaded.subject.bash.createBashResourceTelemetry({
    platform: "darwin",
    processGroupId: 11,
    probe,
    readContext: () => ({ cliRssKb: 20, systemFreeMemoryKb: 30 }),
    onComplete: (sample) => {
      knorviaToolExecResourceSchema.parse(sample);
      results.push(sample);
    },
  });
  await poll(() => true);
  await poll(() => true);
  w.now = 30000;
  tracker.finish("completed");
  tracker.finish("completed");
  assert.equal(cancelled, true);
  assert.equal(results.length, 1);
  assert.equal(commands, 2);
  const { completionToken, ...data } = results[0];
  assert.equal(typeof completionToken, "string");
  assert.equal(data.treeRssKbPeak, 9);
  assert.equal(data.treeCpuTimeMs, 1500);
  assert.equal(data.sampleCount, 2);
  return data;
}
