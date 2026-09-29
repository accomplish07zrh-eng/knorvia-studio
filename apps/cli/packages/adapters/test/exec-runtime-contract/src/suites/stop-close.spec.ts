// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { argvRequest, bashRequest, contractCase } from "../harness/contract-case.js";

contractCase(
  "RUN-03 abort during shell snapshot preparation prevents spawn",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.usePendingExecFile = true;
    const { adapter } = context.createAdapter();
    const controller = new AbortController();
    const resultPromise = context.track(adapter.run(bashRequest(), { signal: controller.signal }));
    const preparation = await context.world.waitForExecFile();
    controller.abort();
    preparation.deferred.resolve({ stderr: "", stdout: "export PATH=/virtual/bin\n" });
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.cancelled, true);
    assert.equal(context.world.spawns.length, 0);
  },
);

contractCase(
  "CLS-01 close during preparation cancels before spawn and waits for finalization",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    context.world.usePendingExecFile = true;
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(bashRequest()));
    const preparation = await context.world.waitForExecFile();
    let closeSettled = false;
    const closePromise = context.track(adapter.close().then(() => void (closeSettled = true)));
    await Promise.resolve();
    assert.equal(closeSettled, false);
    preparation.deferred.resolve({ stderr: "", stdout: "snapshot" });
    const result = await resultPromise;
    await closePromise;
    assert.equal(result.status, "cancelled");
    assert.equal(context.world.spawns.length, 0);
  },
);

contractCase(
  "CLS-02 concurrent close calls wait for one in-flight execution",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const resultPromise = context.track(adapter.run(argvRequest()));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    let firstSettled = false;
    let secondSettled = false;
    const first = context.track(adapter.close().then(() => void (firstSettled = true)));
    const second = context.track(adapter.close().then(() => void (secondSettled = true)));
    await Promise.resolve();
    assert.equal(firstSettled, false);
    assert.equal(secondSettled, false);
    spawn.child.finish(null, "SIGTERM");
    await Promise.all([first, second]);
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(firstSettled, true);
    assert.equal(secondSettled, true);
    assert.equal(context.world.signals.filter((entry) => entry.signal === "SIGTERM").length, 1);
  },
);

contractCase("STOP-02 first stop wins when cancel precedes timeout", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const controller = new AbortController();
  const resultPromise = context.track(
    adapter.run(argvRequest({ timeoutMs: 100 }), { signal: controller.signal }),
  );
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  controller.abort();
  await context.world.clock.advance(100);
  spawn.child.finish(null, "SIGTERM");
  const result = await resultPromise;
  assert.equal(result.status, "cancelled");
  assert.equal(result.cancelled, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.error?.type, "cancelled");
});

contractCase(
  "STOP-03 POSIX termination escalates only after liveness check",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const controller = new AbortController();
    const resultPromise = context.track(adapter.run(argvRequest(), { signal: controller.signal }));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    controller.abort();
    assert.deepEqual(context.world.signals[0], { pid: -(spawn.child.pid ?? 0), signal: "SIGTERM" });
    await context.world.clock.advance(749);
    assert.equal(
      context.world.signals.some((entry) => entry.signal === "SIGKILL"),
      false,
    );
    await context.world.clock.advance(1);
    assert.ok(context.world.signals.some((entry) => entry.signal === 0));
    assert.ok(context.world.signals.some((entry) => entry.signal === "SIGKILL"));
    spawn.child.finish(null, "SIGKILL");
    assert.equal((await resultPromise).status, "cancelled");
  },
);

contractCase(
  "RUN-06 stop immediately followed by root exit still settles once",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const controller = new AbortController();
    const terminalEvents: string[] = [];
    const resultPromise = context.track(
      adapter.run(argvRequest(), {
        onEvent: (event) => {
          if (event.type === "completed" || event.type === "failed") {
            terminalEvents.push(event.type);
          }
        },
        signal: controller.signal,
      }),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    controller.abort();
    spawn.child.finish(null, "SIGTERM");
    const result = await resultPromise;
    await context.world.clock.advance(5_000);
    assert.equal(result.status, "cancelled");
    assert.deepEqual(terminalEvents, ["completed"]);
  },
);

contractCase(
  "CLS-03 work submitted after shutdown begins returns cancelled without spawn",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    await adapter.close();
    const result = await context.track(adapter.run(argvRequest()));
    assert.equal(result.status, "cancelled");
    assert.equal(result.stdout.bytes, 0);
    assert.equal(result.stderr.bytes, 0);
    assert.equal(context.world.spawns.length, 0);
  },
);

contractCase(
  "CLS-04 close waits for background Bash stop and process-tree escalation",
  { env: { SHELL: "/bin/bash" } },
  async (context) => {
    context.world.fileSystem.writeFileSync("/bin/bash", "fixture");
    const { adapter } = context.createAdapter();
    const lifecycle = context.track(
      adapter.runBashWithBackgroundLifecycle(bashRequest(), { mode: "explicit" }),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    const handoff = await lifecycle;
    assert.equal(handoff.kind, "backgrounded");
    let closed = false;
    const close = context.track(adapter.close().then(() => void (closed = true)));
    await Promise.resolve();
    await context.world.clock.advance(0);
    assert.equal(closed, false);
    await context.world.clock.advance(1_500);
    assert.equal(closed, false);
    spawn.child.finish(null, "SIGKILL");
    await context.world.clock.advance(500);
    await close;
    assert.equal(closed, true);
  },
);
