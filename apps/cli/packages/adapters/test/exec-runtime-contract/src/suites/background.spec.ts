// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import type { TraceContext } from "@knorvia/contracts";
import { argvRequest, bashRequest, contractCase } from "../harness/contract-case.js";

function trace(sessionId: string): TraceContext {
  return { sessionId, traceId: `trace-${sessionId}` } as unknown as TraceContext;
}

contractCase("BG-01 start/get/wait share one terminal completion", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const started = await context.track(adapter.start(argvRequest({ trace: trace("session-a") })));
  assert.equal(started.status, "running");
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  const running = await adapter.getBackgroundTask(started.taskId);
  assert.equal(running?.status, "running");
  const completion = context.track(adapter.waitForBackgroundTask(started.taskId));
  spawn.child.stdout.pushBytes("background output");
  spawn.child.finish(0);
  const completed = await completion;
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.result?.stdout.text, "background output");
  assert.equal(completed?.pid, spawn.child.pid);
});

contractCase(
  "BG-10 aborting wait returns current snapshot without cancelling",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const started = await context.track(adapter.start(argvRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    const controller = new AbortController();
    const wait = context.track(
      adapter.waitForBackgroundTask(started.taskId, { signal: controller.signal }),
    );
    controller.abort();
    assert.ok(controller.signal.reason instanceof DOMException);
    const snapshot = await wait;
    assert.equal(snapshot?.status, "running");
    assert.equal(spawn.child.killSignals.length, 0);
    assert.equal(context.world.signals.length, 0);
    spawn.child.finish(0);
    assert.equal((await adapter.waitForBackgroundTask(started.taskId))?.status, "completed");
  },
);

contractCase(
  "BG-09 repeated cancellation is idempotent and finalizes once",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const started = await context.track(adapter.start(argvRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    const completion = context.track(adapter.waitForBackgroundTask(started.taskId));
    const first = await adapter.cancelBackgroundTask(started.taskId);
    const second = await adapter.cancelBackgroundTask(started.taskId);
    assert.equal(first?.status, "cancelled");
    assert.equal(second?.status, "cancelled");
    const marker = new AbortController();
    marker.abort();
    const immediate = await adapter.waitForBackgroundTask(started.taskId, {
      signal: marker.signal,
    });
    assert.equal(immediate?.status, "cancelled");
    assert.equal(immediate?.result, undefined);
    assert.ok(context.world.signals.length > 0 || spawn.child.killSignals.length > 0);
    spawn.child.finish(null, "SIGTERM");
    const final = await completion;
    assert.equal(final?.status, "cancelled");
    assert.equal(final?.result?.error?.type, "cancelled");
  },
);

contractCase(
  "BG-04 explicit Bash handoff retains one child, pid, path, and completion",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const lifecycle = context.track(
      adapter.runBashWithBackgroundLifecycle(bashRequest({ trace: trace("session-b") }), {
        mode: "explicit",
      }),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    const handoff = await lifecycle;
    assert.equal(handoff.kind, "backgrounded");
    if (handoff.kind !== "backgrounded") {
      return;
    }
    assert.equal(context.world.spawns.length, 1);
    assert.equal(handoff.task.pid, spawn.child.pid);
    assert.ok(handoff.task.outputPath);
    context.world.fileSystem.appendFileSync(handoff.task.outputPath, "same-owner-output");
    const liveOutput = await adapter.readBackgroundBashOutput(handoff.task.taskId, "session-b");
    assert.equal(liveOutput.kind, "output");
    if (liveOutput.kind === "output") {
      assert.equal(liveOutput.status, "running");
      assert.match(liveOutput.output, /same-owner-output/u);
    }
    spawn.child.finish(0);
    const complete = await adapter.waitForBackgroundTask(handoff.task.taskId);
    assert.equal(complete?.status, "completed");
    assert.equal(complete?.outputPath, handoff.task.outputPath);
  },
);

contractCase(
  "BG-06 automatic deadline hands off without terminating Bash",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const lifecycle = context.track(
      adapter.runBashWithBackgroundLifecycle(
        bashRequest({ timeoutMs: 50, trace: trace("session-c") }),
        { mode: "auto_on_timeout" },
      ),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    await context.world.clock.advance(49);
    assert.equal(context.world.signals.length, 0);
    await context.world.clock.advance(1);
    const handoff = await lifecycle;
    assert.equal(handoff.kind, "backgrounded");
    assert.equal(context.world.signals.length, 0);
    assert.equal(spawn.child.killSignals.length, 0);
    spawn.child.finish(0);
    if (handoff.kind === "backgrounded") {
      assert.equal((await adapter.waitForBackgroundTask(handoff.task.taskId))?.status, "completed");
    }
  },
);

contractCase(
  "BG-07 nonpositive auto deadline remains foreground",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const lifecycle = context.track(
      adapter.runBashWithBackgroundLifecycle(
        bashRequest({ timeoutMs: 0, trace: trace("session-d") }),
        { mode: "auto_on_timeout" },
      ),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    const result = await lifecycle;
    assert.equal(result.kind, "foreground");
    if (result.kind === "foreground") {
      assert.equal(result.result.status, "completed");
    }
  },
);

contractCase(
  "BG-08 Bash output rejects a mismatched session without reading the file",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const lifecycle = context.track(
      adapter.runBashWithBackgroundLifecycle(bashRequest({ trace: trace("owner-session") }), {
        mode: "explicit",
      }),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    const handoff = await lifecycle;
    assert.equal(handoff.kind, "backgrounded");
    if (handoff.kind !== "backgrounded") {
      return;
    }
    const readsBefore = context.world.fileSystem.calls.filter(
      (call) => call.operation === "readFileSync",
    ).length;
    const output = await adapter.readBackgroundBashOutput(handoff.task.taskId, "other-session");
    const readsAfter = context.world.fileSystem.calls.filter(
      (call) => call.operation === "readFileSync",
    ).length;
    assert.equal(output.kind, "unavailable");
    assert.equal(readsAfter, readsBefore);
    spawn.child.finish(0);
    await adapter.waitForBackgroundTask(handoff.task.taskId);
  },
);

contractCase(
  "BG-11 completed records remain queryable for adapter lifetime",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const started = await context.track(adapter.start(argvRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    await adapter.waitForBackgroundTask(started.taskId);
    const first = await adapter.getBackgroundTask(started.taskId);
    const second = await adapter.getBackgroundTask(started.taskId);
    assert.equal(first?.status, "completed");
    assert.deepEqual(second, first);
  },
);
