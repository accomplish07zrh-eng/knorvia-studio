// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mock, test } from "node:test";

test("Windows recovery revalidates birth before forcing a live PID through the real process owner", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const originalKill = process.kill;
  let alive = true;
  let driftOnVerify = false;
  let changedBirth = false;
  const commands: Array<{ file: string; args: string[] }> = [];
  Object.defineProperty(process, "platform", { value: "win32" });
  process.kill = ((pid: number, signal: number | NodeJS.Signals = 0) => {
    assert.equal(signal, 0, "The fixture never sends a native signal");
    if (pid !== 501) return originalKill(pid, 0);
    if (!alive) throw Object.assign(new Error("synthetic PID exited"), { code: "ESRCH" });
    return true;
  }) as typeof process.kill;
  mock.module("node:child_process", {
    namedExports: {
      ChildProcess,
      spawn() {
        throw new Error("Recovery must not launch a service");
      },
      spawnSync() {
        throw new Error("Windows recovery must use asynchronous inspection");
      },
      execFile(
        file: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) {
        commands.push({ file, args });
        queueMicrotask(() => {
          if (file === "powershell.exe") {
            if (driftOnVerify && args[4]?.includes("WHERE ProcessId = 501")) changedBirth = true;
            callback(
              null,
              alive ? `501 0 ${changedBirth ? "621355968001234570" : "621355968001234560"}` : "",
              "",
            );
          } else {
            assert.equal(file, "taskkill");
            assert(args.includes("501"));
            if (args.includes("/F")) {
              const verified = commands.some(
                (command) =>
                  command.file === "powershell.exe" &&
                  command.args[4]?.includes("WHERE ProcessId = 501"),
              );
              assert.equal(verified, true, "A reconstructed handle cannot force an unverified PID");
              alive = false;
              callback(null, "", "");
            } else callback(new Error("synthetic console process needs force"), "", "");
          }
        });
      },
    },
  });
  try {
    const { createWorkspaceRuntimePort } =
      await import("../src/studio-runtime/adapters/workspaceRuntimeProcess.js");
    const proof = {
      rootPid: 501,
      identities: [
        {
          pid: 501,
          parentPid: 0,
          startToken: createHash("sha256").update("windows-utc-us:123456").digest("hex"),
        },
      ],
    };
    assert.equal(await createWorkspaceRuntimePort().recover(proof), true);
    assert.equal(alive, false);
    assert.equal(
      commands.filter((command) => command.file === "taskkill" && command.args.includes("/F"))
        .length,
      1,
    );
    alive = true;
    driftOnVerify = true;
    commands.length = 0;
    assert.equal(await createWorkspaceRuntimePort().recover(proof), false);
    assert.equal(changedBirth, true, "The forced cleanup pass observes the PID reuse");
    assert.equal(alive, true, "A changed birth identity must never be force-killed");
    assert.equal(
      commands.filter((command) => command.file === "taskkill" && command.args.includes("/F"))
        .length,
      0,
    );
  } finally {
    process.kill = originalKill;
    Object.defineProperty(process, "platform", platform);
    mock.restoreAll();
  }
});
