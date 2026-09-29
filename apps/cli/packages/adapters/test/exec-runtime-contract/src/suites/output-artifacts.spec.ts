// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import type { ExecutionEvent } from "@knorvia/contracts";
import { argvRequest, bashRequest, contractCase } from "../harness/contract-case.js";

function lastOpenedPath(calls: ReadonlyArray<{ operation: string; path: string }>): string {
  const path = calls.filter((call) => call.operation === "open").at(-1)?.path;
  assert.ok(path, "Bash output preparation must open an owned file");
  return path;
}

contractCase(
  "OUT-01 inline byte limit retains a prefix and truthful byte count",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(
      adapter.run(argvRequest({ outputLimit: { maxInlineBytes: 4, persistOutput: "none" } })),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stdout.pushBytes("abcdefgh");
    spawn.child.finish(0);
    const stream = (await resultPromise).stdout;
    assert.equal(stream.text, "abcd");
    assert.equal(stream.bytes, 8);
    assert.equal(stream.truncated, true);
    assert.equal(stream.artifactPath, undefined);
    assert.equal(context.world.fileSystem.writeStreams.length, 0);
  },
);

contractCase(
  "OUT-04 on_truncate backfills prefix and persists the crossing chunk once",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(
      adapter.run(
        argvRequest({
          outputLimit: { maxInlineBytes: 4, maxPersistedBytes: 20, persistOutput: "on_truncate" },
        }),
      ),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stdout.pushBytes("abc");
    assert.equal(context.world.fileSystem.writeStreams.length, 0);
    spawn.child.stdout.pushBytes("defgh");
    spawn.child.finish(0);
    const stream = (await resultPromise).stdout;
    assert.equal(stream.text, "abcd");
    assert.equal(stream.artifactBytes, 8);
    assert.equal(stream.artifactTruncated, false);
    assert.ok(stream.artifactPath);
    assert.equal(context.world.fileSystem.text(stream.artifactPath), "abcdefgh");
  },
);

contractCase("OUT-05 always persistence begins with the first byte", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const resultPromise = context.track(
    adapter.run(
      argvRequest({
        outputLimit: { maxInlineBytes: 20, maxPersistedBytes: 20, persistOutput: "always" },
      }),
    ),
  );
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  spawn.child.stdout.pushBytes("first");
  assert.equal(context.world.fileSystem.writeStreams.length, 1);
  spawn.child.finish(0);
  const stream = (await resultPromise).stdout;
  assert.equal(stream.truncated, false);
  assert.equal(stream.artifactBytes, 5);
  assert.ok(stream.artifactPath);
  assert.equal(context.world.fileSystem.text(stream.artifactPath), "first");
});

contractCase(
  "OUT-07 persisted stream backpressure pauses then resumes source",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    context.world.fileSystem.nextWriteBackpressure = true;
    const resultPromise = context.track(
      adapter.run(argvRequest({ outputLimit: { persistOutput: "always" } })),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stdout.pushBytes("blocked");
    assert.equal(spawn.child.stdout.pauseCount, 1);
    assert.equal(spawn.child.stdout.paused, true);
    context.world.fileSystem.releaseAllDrains();
    assert.equal(spawn.child.stdout.resumeCount, 1);
    assert.equal(spawn.child.stdout.paused, false);
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "OUT-08 write-stream failure marks artifact truncation but still settles",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    context.world.fileSystem.failNext("write-stream", new Error("fixture disk full"));
    const resultPromise = context.track(
      adapter.run(argvRequest({ outputLimit: { persistOutput: "always" } })),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stdout.pushBytes("payload");
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "completed");
    assert.equal(result.stdout.artifactTruncated, true);
  },
);

contractCase("OUT-09 generic persisted budget exhaustion stops execution", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const resultPromise = context.track(
    adapter.run(
      argvRequest({
        outputLimit: {
          killProcessOnPersistedLimit: true,
          maxPersistedBytes: 3,
          persistOutput: "always",
        },
      }),
    ),
  );
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  spawn.child.stdout.pushBytes("over");
  assert.ok(context.world.signals.length > 0 || spawn.child.killSignals.length > 0);
  spawn.child.finish(null, "SIGTERM");
  const result = await resultPromise;
  assert.equal(result.status, "failed");
  assert.equal(result.error?.type, "output_limit");
  assert.equal(result.stdout.bytes, 4);
  assert.equal(result.stdout.artifactBytes, 3);
  assert.equal(result.stdout.artifactTruncated, true);
});

contractCase(
  "BOP-01 Bash inline policy honors a positive environment override",
  { env: { BASH_MAX_OUTPUT_LENGTH: "5", SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    const outputPath = lastOpenedPath(context.world.fileSystem.calls);
    await spawn.child.emitSpawn();
    context.world.fileSystem.appendFileSync(outputPath, "abcdefgh");
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.stdout.text, "abcde");
    assert.equal(result.stdout.bytes, 8);
    assert.equal(result.stdout.truncated, true);
    assert.equal(result.stderr.text, "");
  },
);

contractCase(
  "BFO-03 unavailable Bash read yields a stable placeholder without changing status",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    context.world.fileSystem.failNext(
      "open",
      Object.assign(new Error("fixture unavailable"), { code: "EACCES" }),
    );
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "completed");
    assert.match(result.stdout.text, /unavailable|could not|unable|failed/iu);
  },
);

contractCase(
  "BPR-02 Bash progress preview is bounded and line count does not regress",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter({
      progressIntervalMs: 10,
      progressTailBytes: 4_096,
      progressThresholdMs: 5,
    });
    const events: ExecutionEvent[] = [];
    const resultPromise = context.track(
      adapter.run(bashRequest(), { onEvent: (event) => void events.push(event) }),
    );
    const spawn = await context.world.waitForSpawn();
    const outputPath = lastOpenedPath(context.world.fileSystem.calls);
    await spawn.child.emitSpawn();
    context.world.fileSystem.appendFileSync(outputPath, "one\ntwo\nthree\nfour\nfive\nsix\n");
    await context.world.clock.advance(25);
    const previews = events
      .filter(
        (event): event is Extract<ExecutionEvent, { type: "progress" }> =>
          event.type === "progress",
      )
      .map((event) => event.outputPreview)
      .filter((preview) => preview !== undefined);
    assert.ok(previews.length >= 1);
    assert.ok((previews.at(-1)?.text.split("\n").length ?? 0) <= 5);
    for (let index = 1; index < previews.length; index += 1) {
      assert.ok((previews[index]?.totalLines ?? 0) >= (previews[index - 1]?.totalLines ?? 0));
    }
    spawn.child.finish(0);
    assert.equal((await resultPromise).status, "completed");
  },
);

contractCase(
  "BFO-05 custom Bash persisted limit keeps classified literal 5GB failure",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter({ maxPersistedOutputBytes: 3 });
    const resultPromise = context.track(adapter.run(bashRequest()));
    const spawn = await context.world.waitForSpawn();
    const outputPath = lastOpenedPath(context.world.fileSystem.calls);
    await spawn.child.emitSpawn();
    context.world.fileSystem.appendFileSync(outputPath, "over");
    await context.world.clock.advance(5_000);
    spawn.child.finish(137);
    await context.world.clock.advance(2_000);
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.exitCode, 137);
    assert.equal(result.error?.type, "output_limit");
    assert.match(result.error?.message ?? "", /5GB/u);
  },
);
