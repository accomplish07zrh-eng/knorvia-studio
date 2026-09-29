// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { bashRequest, contractCase } from "../harness/contract-case.js";

contractCase(
  "TEL-01 long POSIX Bash run emits one bounded resource completion sample",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.probeSamples.enqueueReturn([
      { cpuTimeMs: 100, pid: 4_100, rssKb: 25 },
      { cpuTimeMs: 40, pid: 4_101, rssKb: 15 },
    ]);
    const samples: Array<Record<string, unknown>> = [];
    const { adapter } = context.createAdapter({
      onToolExecResource: (sample) => void samples.push(sample),
    });
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(15_000);
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
    assert.equal(samples.length, 1);
    const sample = samples[0];
    assert.equal(sample?.toolName, "bash");
    assert.equal(sample?.platform, "linux");
    assert.equal(sample?.exitKind, "completed");
    assert.equal(sample?.sampleCount, 1);
    assert.equal(sample?.treeRssKbPeak, 40);
    assert.equal(sample?.cliRssKb, 64);
    assert.equal(sample?.systemFreeMemoryKb, 8_192);
  },
);

contractCase(
  "TEL-02 runs shorter than one sampling interval emit nothing",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const samples: Array<Record<string, unknown>> = [];
    const { adapter } = context.createAdapter({
      onToolExecResource: (sample) => void samples.push(sample),
    });
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(14_999);
    spawn.child.finish(0);
    await resultPromise;
    assert.deepEqual(samples, []);
  },
);

contractCase(
  "TEL-03 Windows completion omits process-tree fields and probe calls",
  { env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" }, platform: "win32" },
  async (context) => {
    context.world.fileSystem.writeFileSync("C:\\Windows\\System32\\cmd.exe", "fixture");
    const samples: Array<Record<string, unknown>> = [];
    const { adapter } = context.createAdapter({
      onToolExecResource: (sample) => void samples.push(sample),
    });
    const resultPromise = context.track(
      adapter.run(
        bashRequest({
          command: {
            command: "echo windows",
            mode: "shell",
            shellOverride: {
              dialect: "cmd",
              display: { name: "CMD" },
              path: "cmd.exe",
              source: "user-config",
            },
            shellProfile: "posix-bash",
          },
        }),
      ),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(15_000);
    spawn.child.finish(0);
    await resultPromise;
    assert.equal(samples.length, 1);
    assert.equal(samples[0]?.platform, "win32");
    assert.equal(Object.hasOwn(samples[0] ?? {}, "treeRssKbPeak"), false);
    assert.equal(Object.hasOwn(samples[0] ?? {}, "treeCpuTimeMs"), false);
    assert.equal(context.world.processProbe.calls.length, 0);
  },
);

contractCase(
  "TEL-04 sampling errors consume an attempt and cannot fail execution",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.probeSamples.enqueueThrow(new Error("fixture probe fault"));
    const samples: Array<Record<string, unknown>> = [];
    const { adapter } = context.createAdapter({
      onToolExecResource: (sample) => void samples.push(sample),
    });
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(15_000);
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "completed");
    assert.equal(samples.length, 1);
    assert.equal(samples[0]?.sampleCount, 0);
  },
);

contractCase(
  "TEL-05 completion callback failure is swallowed and sealed once",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    let attempts = 0;
    const { adapter } = context.createAdapter({
      onToolExecResource: () => {
        attempts += 1;
        throw new Error("fixture observer fault");
      },
    });
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(15_000);
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
    await adapter.close();
    assert.equal(attempts, 1);
  },
);

contractCase(
  "TEL-06 telemetry contains no request, identity, path, pid, model, or credential content",
  {
    env: {
      FIXTURE_TOKEN: "secret-token-value",
      MODEL: "private-model-name",
      SHELL: "/bin/bash",
    },
  },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.fileSystem.mkdirSync("/virtual/private-workspace");
    context.world.probeSamples.enqueueReturn([{ cpuTimeMs: 100, pid: 4_100, rssKb: 25 }]);
    const samples: Array<Record<string, unknown>> = [];
    const { adapter } = context.createAdapter({
      onToolExecResource: (sample) => void samples.push(sample),
    });
    const resultPromise = context.track(
      adapter.run(
        bashRequest({
          command: {
            command: "echo private-command-content",
            mode: "shell",
            shellProfile: "posix-bash",
          },
          cwd: "/virtual/private-workspace",
          env: { set: { FIXTURE_CREDENTIAL: "credential-value" } },
        }),
      ),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(15_000);
    spawn.child.finish(0);
    await resultPromise;
    assert.equal(samples.length, 1);
    const serialized = JSON.stringify(samples[0]);
    for (const forbidden of [
      "private-command-content",
      "private-workspace",
      "secret-token-value",
      "private-model-name",
      "credential-value",
      "session",
      "taskId",
      "pid",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `telemetry leaked ${forbidden}`);
    }
    const allowedKeys = new Set([
      "cliRssKb",
      "completionToken",
      "durationMs",
      "exitKind",
      "platform",
      "sampleCount",
      "systemFreeMemoryKb",
      "toolName",
      "treeCpuTimeMs",
      "treeRssKbPeak",
    ]);
    assert.ok(Object.keys(samples[0] ?? {}).every((key) => allowedKeys.has(key)));
  },
);
