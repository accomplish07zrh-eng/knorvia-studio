// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ProcessTreeTerminatorOptions } from "../src/process/processTreeTypes.js";

test("workspace WMI selection keeps provider defaults, birth codec, flight isolation and cleanup deadlines", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  const env = { PATH: "C:/runtime", SystemRoot: "C:/Windows" };
  const selected = {
    helperEnvironment: env,
    windowsProcessQuery: "wmi",
  } as ProcessTreeTerminatorOptions;
  const calls: Array<{ command: string; timeout: number; env: NodeJS.ProcessEnv }> = [];
  const callbacks: Array<(error: Error | null, stdout: string, stderr: string) => void> = [];
  const row = "501 0 621355968001234560";
  mock.module("node:child_process", {
    namedExports: {
      execFile(
        _file: string,
        args: string[],
        options: (typeof calls)[number],
        callback: (typeof callbacks)[number],
      ) {
        calls.push({ command: args[4]!, timeout: options.timeout, env: options.env });
        callbacks.push(callback);
      },
    },
  });
  try {
    const { readWindowsProcessListAsync, verifyWindowsProcessIdentityAsync } =
      await import("../src/process/windowsProcessListAsync.js");
    const legacy = readWindowsProcessListAsync({ helperEnvironment: env });
    const workspace = readWindowsProcessListAsync(selected);
    const reused = readWindowsProcessListAsync(selected);
    assert.equal(calls.length, 2, "CIM and WMI cannot reuse the same in-flight query");
    assert.match(calls[0]!.command, /^Get-CimInstance Win32_Process \|/);
    assert.equal(calls[0]!.timeout, 2500);
    assert.match(calls[1]!.command, /System\.Management\.ManagementObjectSearcher/);
    assert(!calls[1]!.command.includes("Get-CimInstance"));
    assert.match(calls[1]!.command, /ProcessId, ParentProcessId, CreationDate/);
    assert.match(calls[1]!.command, /Dispose\(\)/);
    callbacks[0]!(null, row, "");
    callbacks[1]!(null, row, "");
    const [oldIdentities, identities, same] = await Promise.all([legacy, workspace, reused]);
    assert.equal(identities, same);
    assert.deepEqual(identities, oldIdentities, "Existing persisted birth tokens remain valid");
    assert.equal(identities[0]!.startTime, "windows-utc-us:123456");
    const verify = verifyWindowsProcessIdentityAsync(identities[0]!, 750, selected);
    assert.match(calls[2]!.command, /WHERE ProcessId = 501/);
    assert.equal(calls[2]!.timeout, 750);
    callbacks[2]!(null, row, "");
    assert.equal(await verify, true);
    const bounded = readWindowsProcessListAsync({
      ...selected,
      windowsCleanupDeadlineAtMs: Date.now() + 300,
    });
    assert(calls[3]!.timeout > 0 && calls[3]!.timeout <= 300);
    callbacks[3]!(null, row, "");
    await bounded;
    const timedOut = Object.assign(new Error("synthetic query timeout"), {
      code: null,
      killed: true,
      signal: "SIGTERM",
    });
    const cold = readWindowsProcessListAsync(selected);
    callbacks[4]!(timedOut, "", "");
    assert.equal(calls.length, 6, "Only the timed-out WMI read retries");
    assert.equal(calls[4]!.timeout, 2500);
    assert.equal(calls[5]!.timeout, 2500);
    callbacks[5]!(timedOut, "", "");
    assert.deepEqual(await cold, [], "A second timeout remains unavailable");
    const oldTimeout = readWindowsProcessListAsync({ helperEnvironment: env });
    callbacks[6]!(timedOut, "", "");
    await oldTimeout;
    assert.equal(calls.length, 7, "Provider default reads never acquire a new retry");
    const cleanupTimeout = readWindowsProcessListAsync({
      ...selected,
      windowsCleanupDeadlineAtMs: Date.now() + 300,
    });
    callbacks[7]!(timedOut, "", "");
    await cleanupTimeout;
    assert.equal(calls.length, 8, "Cleanup reads keep their existing absolute budget");
    for (const call of calls) assert.equal(call.env, env);
  } finally {
    Object.defineProperty(process, "platform", platform);
    mock.restoreAll();
  }
});
