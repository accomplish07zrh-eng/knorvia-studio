// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ComputerUseRuntime } from "@knorvia/cua";
import { windowsRuntime, watch } from "./dispatch-test-support.js";
import { fixture } from "./dispatch-fixture.js";

for (const format of ["explicit", "fallback"] as const) {
  test(`MCP cancellation preserves ${format} structured error results`, async (t) => {
    const started = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>();
    const controller = new AbortController();
    const diagnostic = {
      isError: true,
      content: [{ type: "text", text: "Action outcome is unknown" }],
      structuredContent: { outcome: "unknown" },
    };
    const { server } = fixture(t, async () => {
      started.resolve();
      await gate.promise;
      return {
        logs: "",
        ...(format === "explicit"
          ? { structuredResults: [diagnostic] }
          : { result: `=> ${JSON.stringify(diagnostic)}` }),
      };
    });
    const result = watch(
      server.call({ name: "js", arguments: { code: "running" } }, {}, controller.signal),
    );
    await started.promise;
    controller.abort(new Error("caller cancelled"));
    gate.resolve();
    assert.deepEqual(await result.promise, diagnostic);
  });
}

test("MCP repeated dispose waits for the same resource cleanup", async (t) => {
  const gate = Promise.withResolvers<void>();
  let disposals = 0;
  const { runtime } = fixture(t, undefined, {
    windowsRuntime: windowsRuntime({
      dispose: async () => {
        disposals++;
        await gate.promise;
      },
    }),
  });
  const first = watch(runtime.dispose());
  await setImmediate();
  const second = watch(runtime.dispose());
  try {
    await setImmediate();
    assert.equal(first.settled(), false);
    assert.equal(second.settled(), false);
  } finally {
    gate.resolve();
    await Promise.all([first.promise, second.promise]);
  }
  assert.equal(disposals, 1);
});

test("MCP disposed runtime rejects discovery as well as execution", async (t) => {
  const { runtime, server } = fixture(t);
  await runtime.dispose();
  await assert.rejects(server.call({ name: "js", arguments: { code: "x" } }), /disposed/);
  await assert.rejects(server.list(), /disposed/);
});

test("MCP dispose waits for accepted handlers to settle", async (t) => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<AbortSignal>();
  const { runtime, server } = fixture(t, async ({ signal }) => {
    started.resolve(signal);
    await gate.promise;
    return { logs: "late success" };
  });
  const result = watch(server.call({ name: "js", arguments: { code: "running" } }));
  const signal = await started.promise;
  const closing = watch(runtime.dispose());
  try {
    await setImmediate();
    assert.equal(signal.aborted, true);
    assert.equal(closing.settled(), false);
  } finally {
    gate.resolve();
    await Promise.allSettled([closing.promise, result.promise]);
  }
});

test("MCP cancelled JS calls cannot publish a late success from an uncooperative executor", async (t) => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>(),
    controller = new AbortController();
  const { server } = fixture(t, async () => {
    started.resolve();
    await gate.promise;
    return { logs: "late success" };
  });
  const result = watch(
    server.call({ name: "js", arguments: { code: "running" } }, {}, controller.signal),
  );
  await started.promise;
  controller.abort(new Error("cancelled while running"));
  gate.resolve();
  await assert.rejects(result.promise, /cancelled while running/);
});

test("MCP cancellation retains the executor's structured failure diagnostics", async (t) => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>(),
    controller = new AbortController();
  const { server } = fixture(t, async () => {
    started.resolve();
    await gate.promise;
    return {
      logs: "hidden",
      error: { name: "AbortError", message: "execution failed; kernel was reset" },
    };
  });
  const result = server.call({ name: "js", arguments: { code: "running" } }, {}, controller.signal);
  await started.promise;
  controller.abort();
  gate.resolve();
  assert.deepEqual(await result, {
    content: [{ type: "text", text: "execution failed; kernel was reset" }],
    isError: true,
  });
});

test("MCP cleanup failure cannot prevent other owned runtimes from being released", async (t) => {
  let cuaDisposed = 0,
    windowsDisposed = 0;
  const cua: ComputerUseRuntime = {
    execute: async () => ({ content: [] }),
    closeSession: async () => {},
    dispose: async () => {
      cuaDisposed++;
      throw new Error("fixture cleanup");
    },
  };
  const { runtime } = fixture(t, undefined, {
    cuaRuntime: cua,
    windowsRuntime: windowsRuntime({
      dispose: async () => {
        windowsDisposed++;
      },
    }),
  });
  await runtime.dispose();
  assert.equal(cuaDisposed, 1);
  assert.equal(windowsDisposed, 1);
});

test("MCP close rejects queued work before an uncooperative active handler completes", async (t) => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>();
  const { runtime, server } = fixture(t, async () => {
    started.resolve();
    await gate.promise;
    return { logs: "finished" };
  });
  const active = watch(
    server.call({ name: "js", arguments: { code: "active" } }, { session_id: "same" }),
  );
  await started.promise;
  const queued = watch(
    server.call({ name: "js", arguments: { code: "queued" } }, { session_id: "same" }),
  );
  await setImmediate();
  const closing = watch(runtime.dispose());
  try {
    await setImmediate();
    assert.equal(queued.settled(), true);
    assert.equal(closing.settled(), false);
  } finally {
    gate.resolve();
    await Promise.allSettled([active.promise, queued.promise, closing.promise]);
  }
  await assert.rejects(queued.promise, /disposed/);
});

test("MCP synchronous cleanup failure cannot skip independent cleanup", async (t) => {
  let disposed = false;
  const cua: ComputerUseRuntime = {
    execute: async () => ({ content: [] }),
    closeSession: async () => {},
    dispose: () => {
      throw new Error("synchronous fixture failure");
    },
  };
  const { runtime } = fixture(t, undefined, {
    cuaRuntime: cua,
    windowsRuntime: windowsRuntime({
      dispose: async () => {
        disposed = true;
      },
    }),
  });
  await runtime.dispose();
  assert.equal(disposed, true);
});
