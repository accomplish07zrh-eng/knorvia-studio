import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic Windows flights respect spawn identity and cache permission denial without fallback", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  const callbacks: Array<(error: unknown, stdout: string, stderr: string) => void> = [];
  const denied = Object.assign(new Error("synthetic denied"), { code: "EACCES" });
  mock.method(Date, "now", () => 100);
  mock.module("node:child_process", {
    namedExports: {
      execFile: (
        command: string,
        args: string[],
        options: unknown,
        callback: (typeof callbacks)[number],
      ) => {
        assert.equal(command, "powershell.exe");
        assert.deepEqual(args.slice(0, 4), [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
        ]);
        assert.match(args[4]!, /^Get-CimInstance Win32_Process \|/);
        assert.deepEqual(options, { encoding: "utf8", timeout: 2500, windowsHide: true });
        callbacks.push(callback);
      },
    },
  });
  try {
    const { readWindowsProcessListAsync, verifyWindowsProcessIdentityAsync } =
      await import("../src/process/windowsProcessListAsync.js");
    assert.deepEqual(await readWindowsProcessListAsync({ windowsCleanupDeadlineAtMs: 100 }), []);
    assert.equal(callbacks.length, 0);
    const old = readWindowsProcessListAsync({});
    const reuse = readWindowsProcessListAsync({ ownedProcessStartedAtMs: 99 });
    assert.equal(callbacks.length, 1);
    const fresh = readWindowsProcessListAsync({ ownedProcessStartedAtMs: 100 });
    assert.equal(callbacks.length, 2);
    callbacks[0]!(null, "501 0 621355968001000000", "");
    const [oldRows, reusedRows] = await Promise.all([old, reuse]);
    assert.equal(oldRows, reusedRows);
    assert.deepEqual(oldRows, [{ pid: 501, parentPid: 0, startTime: "windows-utc-us:100000" }]);
    const freshReuse = readWindowsProcessListAsync({ ownedProcessStartedAtMs: 99 });
    assert.equal(callbacks.length, 2);
    callbacks[1]!(denied, "", "");
    assert.deepEqual(await fresh, []);
    assert.deepEqual(await freshReuse, []);
    assert.deepEqual(await readWindowsProcessListAsync({}), []);
    assert.equal(
      await verifyWindowsProcessIdentityAsync(
        { pid: 501, parentPid: 0, startTime: "windows-utc-us:100000" },
        10,
      ),
      false,
    );
    assert.equal(callbacks.length, 2);
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
    mock.restoreAll();
  }
});
