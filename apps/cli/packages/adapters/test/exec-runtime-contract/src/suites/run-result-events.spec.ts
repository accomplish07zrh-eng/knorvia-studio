// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import type { ExecutionEvent, Logger, TraceContext } from "@knorvia/contracts";
import { argvRequest, assertTerminalEventOrder, contractCase } from "../harness/contract-case.js";

function logger(): Logger {
  const instance: Logger = {
    child: () => instance,
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  };
  return instance;
}

contractCase(
  "RUN-01 successful argv run emits ordered output and completion",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const events = context.events();
    const resultPromise = context.track(adapter.run(argvRequest(), { onEvent: events.onEvent }));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stdout.pushBytes("alpha");
    spawn.child.stderr.pushBytes("beta");
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "completed");
    assert.equal(result.stdout.text, "alpha");
    assert.equal(result.stderr.text, "beta");
    assert.equal(result.stdout.bytes, 5);
    assert.equal(result.pid, spawn.child.pid);
    assertTerminalEventOrder(events.list, "completed");
    assert.deepEqual(
      events.list
        .filter((event) => event.type === "stdout" || event.type === "stderr")
        .map((event) => event.type),
      ["stdout", "stderr"],
    );
  },
);

contractCase(
  "RES-02 ordinary nonzero exit does not invent a classified failure",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const events = context.events();
    const resultPromise = context.track(adapter.run(argvRequest(), { onEvent: events.onEvent }));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.stderr.pushBytes("expected tool failure");
    spawn.child.finish(9);
    const result = await resultPromise;
    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, 9);
    assert.equal(result.error, undefined);
    assertTerminalEventOrder(events.list, "completed");
  },
);

contractCase(
  "RES-01 spawn exception produces spawn_error and failed event",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const events = context.events();
    context.world.spawnError = Object.assign(new Error("fixture missing executable"), {
      code: "ENOENT",
    });
    const result = await context.track(adapter.run(argvRequest(), { onEvent: events.onEvent }));
    assert.equal(result.status, "spawn_error");
    assert.equal(result.error?.type, "spawn_error");
    assert.match(result.error?.message ?? "", /missing executable/iu);
    assert.equal(context.world.spawns.length, 0);
    assert.equal(events.list.at(-1)?.type, "failed");
    assert.equal(events.list.filter((event) => event.type === "failed").length, 1);
  },
);

contractCase("RUN-02 pre-aborted request never spawns", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const controller = new AbortController();
  controller.abort();
  assert.ok(controller.signal.reason instanceof DOMException);
  const result = await context.track(adapter.run(argvRequest(), { signal: controller.signal }));
  assert.equal(result.status, "cancelled");
  assert.equal(result.cancelled, true);
  assert.equal(result.error?.type, "cancelled");
  assert.equal(context.world.spawns.length, 0);
});

contractCase(
  "EVT-03 rejected callback promise cannot alter execution settlement",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    const events: ExecutionEvent[] = [];
    const rejected = Promise.reject(new Error("observer rejected"));
    await rejected.catch(() => undefined);
    const resultPromise = context.track(
      adapter.run(argvRequest(), {
        onEvent: (event) => {
          events.push(event);
          return rejected;
        },
      }),
    );
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "completed");
    assertTerminalEventOrder(events, "completed");
  },
);

contractCase("IO-02 expected EPIPE while closing stdin is secondary", {}, async (context) => {
  const { adapter } = context.createAdapter();
  context.world.nextStdinError = Object.assign(new Error("pipe closed"), { code: "EPIPE" });
  const resultPromise = context.track(adapter.run(argvRequest({ stdin: "request body" })));
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  spawn.child.finish(0);
  const result = await resultPromise;
  assert.equal(spawn.child.stdin.text, "");
  assert.equal(result.status, "completed");
});

contractCase(
  "IO-03 unexpected stdin error fails an otherwise successful run",
  {},
  async (context) => {
    const { adapter } = context.createAdapter();
    context.world.nextStdinError = Object.assign(new Error("fixture input fault"), { code: "EIO" });
    const resultPromise = context.track(adapter.run(argvRequest({ stdin: "request body" })));
    const spawn = await context.world.waitForSpawn();
    await spawn.child.emitSpawn();
    spawn.child.finish(0);
    const result = await resultPromise;
    assert.equal(result.status, "failed");
    assert.match(result.error?.message ?? "", /input fault/iu);
  },
);

contractCase("STOP-01 timeout starts after spawn and owns terminal status", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const resultPromise = context.track(adapter.run(argvRequest({ timeoutMs: 100 })));
  await context.world.clock.advance(1_000);
  assert.equal(
    context.world.signals.length,
    0,
    "pre-spawn preparation does not consume runtime timeout",
  );
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  await context.world.clock.advance(99);
  assert.equal(context.world.signals.length, 0);
  await context.world.clock.advance(1);
  assert.ok(context.world.signals.length > 0 || spawn.child.killSignals.length > 0);
  spawn.child.finish(null, "SIGTERM");
  const result = await resultPromise;
  assert.equal(result.status, "timed_out");
  assert.equal(result.timedOut, true);
  assert.equal(result.error?.type, "timeout");
});

contractCase("RUN-08 trace and context objects survive the run unchanged", {}, async (context) => {
  const { adapter } = context.createAdapter();
  const trace = {
    sessionId: "session-fixture",
    traceId: "trace-fixture",
  } as unknown as TraceContext;
  const request = argvRequest({ trace });
  const resultPromise = context.track(
    adapter.run(request, {
      context: { abortSignal: new AbortController().signal, logger: logger(), trace },
    }),
  );
  const spawn = await context.world.waitForSpawn();
  await spawn.child.emitSpawn();
  spawn.child.finish(0);
  assert.equal((await resultPromise).status, "completed");
  assert.equal(request.trace, trace);
  assert.equal(trace.traceId, "trace-fixture");
});
