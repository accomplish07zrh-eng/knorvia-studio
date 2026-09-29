// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bounded,
  deferred,
  fixture,
  OwnedChild,
  rejected,
} from "./mcp-process-boundary.fixture.js";
import type { WindowsJobObjectController } from "../src/mcp/windows-job-object.js";

test("start captures start time before SDK wait and records only the first exit across restarts", async () => {
  const h = await fixture();
  const gate = deferred<void>();
  h.sdk.child = new OwnedChild();
  h.sdk.start = () => gate.promise;
  const transport = h.transport();
  const started = transport.start();
  assert.equal(h.count("native.now"), 1);
  h.time = 2000;
  gate.resolve();
  await bounded(started, "SDK start");
  assert.equal(transport.processAlive, true);
  assert.equal(h.count("sdk.pid"), 0);
  h.time = 2500;
  h.sdk.child.exit(7, "SIGTERM");
  const info = transport.processExit;
  assert.deepEqual(info, { exitCode: 7, exitedAt: 2500, signal: "SIGTERM", startedAt: 1000 });
  assert.deepEqual(Object.keys(info!), ["exitCode", "exitedAt", "signal", "startedAt"]);
  assert.equal(transport.processAlive, false);
  h.sdk.child = new OwnedChild(99);
  await transport.start();
  assert.equal(transport.processAlive, true);
  h.sdk.child.exit(0);
  assert.equal(transport.processExit, info);
  assert.equal(h.count("native.now"), 3);
});

test("already-exited and missing children stop post-start work; SDK failure does not attach", async () => {
  const h = await fixture();
  h.processView.platform = "win32";
  const child = new OwnedChild();
  child.exitCode = 0;
  h.sdk.child = child;
  const transport = h.transport();
  await transport.start();
  assert.equal(child.listeners.length, 0);
  assert.equal(h.count("job.attach"), 0);
  assert.equal(transport.processExit?.exitCode, 0);
  h.sdk.child = undefined;
  await transport.start();
  assert.equal(transport.processExit?.exitCode, 0);
  const marker = new Error("SDK start");
  h.sdk.start = async () => {
    throw marker;
  };
  assert.equal(await rejected(transport.start()), marker);
  assert.equal(h.count("job.attach"), 0);
});

test("job factory is captured, called with transport receiver, and late attach survives earlier termination", async () => {
  const h = await fixture();
  h.processView.platform = "win32";
  h.sdk.child = new OwnedChild();
  const entered = deferred<void>();
  const gate = deferred<WindowsJobObjectController | undefined>();
  let transport: ReturnType<typeof h.transport>;
  const options = {
    windowsJobObjectFactory: function (this: unknown, pid: number) {
      assert.equal(this, transport);
      assert.equal(pid, 42);
      entered.resolve();
      return gate.promise;
    },
  };
  transport = h.transport({ command: "owned" }, options);
  options.windowsJobObjectFactory = async () => {
    assert.fail("factory replacement is not captured");
  };
  const start = transport.start();
  await bounded(entered.promise, "attach began");
  await transport.terminateWindowsJobObject();
  h.sdk.child.exit(0);
  const controller = {
    terminate() {
      h.record("controller.terminate");
    },
    close() {
      h.record("controller.close");
    },
  };
  gate.resolve(controller);
  await bounded(start, "late attach");
  await transport.terminateWindowsJobObject();
  await transport.terminateWindowsJobObject();
  assert.deepEqual(h.events("controller.terminate"), [[]]);
  assert.deepEqual(h.events("controller.close"), [[]]);
});

test("failed reattachment clears the current reference without closing the previous controller", async () => {
  const h = await fixture();
  h.processView.platform = "win32";
  h.sdk.child = new OwnedChild();
  let attempts = 0;
  const previous = {
    terminate() {
      assert.fail("old controller was replaced");
    },
    close() {
      assert.fail("replacement does not close old controller");
    },
  };
  const transport = h.transport(
    { command: "owned" },
    {
      windowsJobObjectFactory: async () => {
        if (++attempts === 1) return previous;
        throw new Error("attach failed");
      },
    },
  );
  await transport.start();
  await transport.start();
  await transport.terminateWindowsJobObject();
  assert.equal(attempts, 2);
  const fallback = h.transport(
    { command: "owned" },
    { windowsJobObjectFactory: null as unknown as undefined },
  );
  await fallback.start();
  assert.equal(h.events("job.attach")[0]?.[1], fallback);
});

test("dispose captures PID, clears job before callbacks, swallows tree errors and uses the initial SDK hook", async () => {
  const h = await fixture();
  h.processView.platform = "win32";
  const child = new OwnedChild();
  h.sdk.child = child;
  let transport: ReturnType<typeof h.transport>;
  const controller = {
    terminate() {
      h.record("controller.terminate");
      child.pid = 88;
      void transport.terminateWindowsJobObject();
      throw new Error("ignored terminate");
    },
    close() {
      h.record("controller.close");
      throw new Error("ignored close");
    },
  };
  transport = h.transport(
    { command: "owned" },
    { windowsJobObjectFactory: async () => controller },
  );
  await transport.start();
  Object.defineProperty(h.OwnedSdk.prototype, "_dispose", {
    value: () => {
      assert.fail("late SDK hook replacement");
    },
  });
  h.links.terminate = async (pid) => {
    h.record("tree.terminate", pid);
    throw new Error("ignored tree");
  };
  await h.dispose(transport);
  assert.deepEqual(
    h
      .names()
      .filter((name) =>
        ["controller.terminate", "controller.close", "tree.terminate", "sdk.dispose"].includes(
          name,
        ),
      ),
    ["controller.terminate", "controller.close", "tree.terminate", "sdk.dispose"],
  );
  assert.deepEqual(h.events("tree.terminate"), [[42]]);
  await transport.close();
  assert.equal(h.count("sdk.close"), 1);
  assert.equal(h.count("tree.terminate"), 1);
});

test("missing own SDK hook falls back to live close while truthy non-functions are not silently accepted", async () => {
  for (const mode of ["absent", "getter", "inherited"] as const) {
    const h = await fixture(mode);
    const transport = h.transport();
    const marker = new Error("live close");
    transport.close = async () => {
      h.record("live.close");
      throw marker;
    };
    assert.equal(await rejected(h.dispose(transport)), marker);
    assert.equal(h.count("sdk.dispose"), 0);
    assert.equal(h.count("live.close"), 1);
  }
  const h = await fixture("nonfunction");
  assert.ok((await rejected(h.dispose(h.transport()))) instanceof TypeError);
});

test("dispose validates only its tree PID and keeps pre-tree failures outside the swallowed boundary", async () => {
  for (const pid of [0, -1, 1.5, NaN]) {
    const h = await fixture();
    h.sdk.child = new OwnedChild(pid);
    const transport = h.transport();
    await transport.start();
    await h.dispose(transport);
    assert.equal(h.count("tree.terminate"), 0);
    assert.equal(h.count("sdk.dispose"), 1);
  }
  const h = await fixture();
  const transport = h.transport();
  const marker = new Error("job override");
  transport.terminateWindowsJobObject = async () => {
    throw marker;
  };
  assert.equal(await rejected(h.dispose(transport)), marker);
  assert.equal(h.count("sdk.dispose"), 0);
});

test("concurrent dispose calls do not join a single in-flight cleanup", async () => {
  const h = await fixture();
  h.sdk.child = new OwnedChild();
  const transport = h.transport();
  await transport.start();
  const entered = deferred<void>();
  const gate = deferred<void>();
  let count = 0;
  h.links.terminate = (pid) => {
    h.record("tree.terminate", pid);
    if (++count === 2) entered.resolve();
    return gate.promise;
  };
  const first = h.dispose(transport);
  const second = h.dispose(transport);
  await bounded(entered.promise, "two cleanup owners");
  assert.equal(h.count("sdk.dispose"), 0);
  gate.resolve();
  await bounded(Promise.all([first, second]), "cleanups finish");
  assert.equal(h.count("sdk.dispose"), 2);
});
