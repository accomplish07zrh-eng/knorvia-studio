// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ChildProcess } from "node:child_process";
import { workspaceRuntimeEnvironment } from "../src/studio-runtime/domain/workspaceRuntimeEnvironment.js";

test("Windows query, identity verification, flights and taskkill carry the selected helper environment", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  const env = workspaceRuntimeEnvironment(
    {
      pAtH: "C:/runtime",
      SystemRoot: "C:/Windows",
      gH_tOkEn: "synthetic",
      OpenAI_Api_Key: "synthetic",
    },
    "win32",
  );
  const other = { ...env, PATH: "C:/other" };
  const calls: Array<{ command: string; env: NodeJS.ProcessEnv }> = [];
  const callbacks: Array<(error: null, stdout: string, stderr: string) => void> = [];
  const row = "501 0 621355968001000000";
  mock.module("node:child_process", {
    namedExports: {
      spawnSync(command: string, _args: string[], options: { env: NodeJS.ProcessEnv }) {
        calls.push({ command, env: options.env });
        return { status: 0, stdout: row };
      },
      execFile(
        command: string,
        _args: string[],
        options: { env: NodeJS.ProcessEnv },
        callback: (typeof callbacks)[number],
      ) {
        calls.push({ command, env: options.env });
        if (command === "taskkill") queueMicrotask(() => callback(null, "", ""));
        else callbacks.push(callback);
      },
    },
  });
  try {
    const { captureProcessTreeSnapshot } = await import("../src/process/processTreeSnapshot.js");
    const child = { pid: 501 } as ChildProcess;
    assert(captureProcessTreeSnapshot(child, { helperEnvironment: env }));
    assert(captureProcessTreeSnapshot(child, { helperEnvironment: env }));
    assert(captureProcessTreeSnapshot(child, { helperEnvironment: other }));
    assert.equal(calls.length, 2, "Different environment selections cannot share a sync cache");
    const { readWindowsProcessListAsync, verifyWindowsProcessIdentityAsync } =
      await import("../src/process/windowsProcessListAsync.js");
    const first = readWindowsProcessListAsync({ helperEnvironment: env });
    const reuse = readWindowsProcessListAsync({ helperEnvironment: env });
    const different = readWindowsProcessListAsync({ helperEnvironment: other });
    assert.equal(
      callbacks.length,
      2,
      "Different environment selections cannot share an async flight",
    );
    callbacks[0]!(null, row, "");
    callbacks[1]!(null, row, "");
    const [identities, shared] = await Promise.all([first, reuse, different]);
    assert.equal(identities, shared);
    const verifying = verifyWindowsProcessIdentityAsync(identities[0]!, 750, {
      helperEnvironment: env,
    });
    callbacks[2]!(null, row, "");
    assert.equal(await verifying, true);
    const { defaultWindowsTaskkillRunner } =
      await import("../src/process/windowsTaskkillRunner.js");
    await defaultWindowsTaskkillRunner({
      pid: 501,
      force: true,
      timeoutMs: 100,
      helperEnvironment: env,
    });
    assert.equal(calls.at(-1)?.command, "taskkill");
    for (const call of calls) {
      assert(
        call.env === env || call.env === other,
        `${call.command}: selected environment was dropped`,
      );
      assert.equal(call.env.gH_tOkEn, undefined);
      assert.equal(call.env.OpenAI_Api_Key, undefined);
    }
  } finally {
    Object.defineProperty(process, "platform", platform);
    mock.restoreAll();
  }
});
