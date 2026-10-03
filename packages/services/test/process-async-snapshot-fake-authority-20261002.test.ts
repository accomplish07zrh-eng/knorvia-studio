import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ChildProcess } from "node:child_process";

test("synthetic async query cannot reclaim reused root or descendants at the exit boundary", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  const child = {
    pid: 501,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
  };
  const rows = [
    { pid: 501, parentPid: 0, startTime: "windows-utc-us:201000" },
    { pid: 502, parentPid: 501, startTime: "windows-utc-us:150000" },
    { pid: 503, parentPid: 501, startTime: "windows-utc-us:200000" },
  ];
  let filtering = false;
  let tracked: typeof rows = [];
  const options = { ownedProcessStartedAtMs: 100, resolveOwnedProcessExitedAtMs: () => 200 };
  mock.module(new URL("../src/process/windowsProcessListAsync.ts", import.meta.url).href, {
    namedExports: {
      readWindowsProcessListAsync: async (received: unknown) => {
        assert.equal(received, options);
        child.exitCode = 0;
        if (filtering) tracked.push(rows[2]!);
        return rows;
      },
      verifyWindowsProcessIdentityAsync: async () => {
        throw new Error("unexpected verifier port");
      },
    },
  });
  mock.module(new URL("../src/process/processTreeSnapshot.ts", import.meta.url).href, {
    namedExports: {
      captureProcessTreeSnapshot: () => {
        throw new Error("unexpected synchronous port");
      },
      captureExitedRootDescendantsSnapshot: () => {
        throw new Error("unexpected synchronous port");
      },
      filterCurrentProcessIdentities: () => {
        throw new Error("unexpected synchronous port");
      },
    },
  });
  try {
    const { captureProcessTreeSnapshotAsync, filterCurrentProcessIdentitiesAsync } =
      await import("../src/process/processTreeSnapshotAsync.js");
    const result = await captureProcessTreeSnapshotAsync(child as unknown as ChildProcess, options);
    assert.ok(result);
    assert.deepEqual(result.descendantPids, [502]);
    assert.equal(result.identities.length, 1);
    assert.equal(result.identities[0], rows[1]);
    filtering = true;
    tracked = [rows[1]!];
    const filtered = await filterCurrentProcessIdentitiesAsync(tracked, options);
    assert.deepEqual(filtered, [rows[1]]);
    assert.equal(filtered[0], rows[1]);
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
  }
});
