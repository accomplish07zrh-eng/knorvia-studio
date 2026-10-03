import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ChildProcess } from "node:child_process";
import type { ProcessIdentity } from "../src/process/processTreeTypes.js";

test("synthetic waiter replaces stale identities and performs only signal-zero observations", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "linux" });
  const signals: number[] = [];
  const removed: unknown[] = [];
  let alive = true;
  mock.method(process, "kill", (pid: number, signal?: string | number) => {
    assert.equal(signal, 0);
    signals.push(pid);
    if (!alive) throw Object.assign(new Error("synthetic absent"), { code: "ESRCH" });
    return true;
  });
  const child = {
    pid: 501,
    exitCode: 0,
    signalCode: null,
    once: (event: string) => {
      assert.equal(event, "exit");
    },
    off: (event: string, listener: unknown) => {
      assert.equal(event, "exit");
      removed.push(listener);
    },
  } as unknown as ChildProcess;
  const stale: ProcessIdentity = { pid: 502, parentPid: 501, startTime: "synthetic-old" };
  const owned = { childStillOwned: false, currentIdentities: [stale], knownIdentities: [stale] };
  try {
    const { waitForProcessTreeTermination } = await import("../src/process/processTreeWaiter.js");
    const result = await waitForProcessTreeTermination(
      child,
      { waitAfterForceMs: 0 },
      owned,
      false,
      (receivedChild, receivedOptions) => {
        assert.equal(receivedChild, child);
        const options = receivedOptions as typeof receivedOptions & {
          knownIdentities: ProcessIdentity[];
          resolvedOwnership: unknown;
          onForceCleanup: (result: { identities: ProcessIdentity[] }) => void;
        };
        assert.equal(options.knownIdentities, owned.knownIdentities);
        assert.equal(options.resolvedOwnership, owned);
        assert.equal(options.keepForceTimerRef, true);
        alive = false;
        options.onForceCleanup({
          identities: [{ pid: 503, parentPid: 501, startTime: "synthetic-current" }],
        });
      },
    );
    assert.deepEqual(result, { remainingPids: [] });
    assert.deepEqual(signals, [503, 503]);
    assert.equal(removed.length, 1);
    Object.defineProperty(process, "platform", { value: "win32" });
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100 });
    alive = true;
    signals.length = 0;
    const observingChild = { ...child, exitCode: null, signalCode: null } as ChildProcess;
    const observing = waitForProcessTreeTermination(
      observingChild,
      { forceAfterMs: 0, waitAfterForceMs: 0, windowsCleanupDeadlineAtMs: 120 },
      { childStillOwned: true, currentIdentities: [], knownIdentities: [] },
      false,
      () => {},
    );
    mock.timers.tick(19);
    assert.equal(removed.length, 1);
    mock.timers.tick(1);
    assert.deepEqual(await observing, { remainingPids: [501] });
    assert.deepEqual(signals, [501, 501]);
    assert.equal(removed.length, 2);
    mock.timers.tick(1000);
    assert.deepEqual(signals, [501, 501]);
    mock.timers.reset();
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
    mock.restoreAll();
  }
});
