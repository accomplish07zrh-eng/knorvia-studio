// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Fixture } from "./workspace-hook-trust.fixture.js";
import { guard } from "./workspace-hook-trust.fixture.js";

export async function ownedProcess(f: Fixture, mode: "idle" | "writer") {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./workspace-hook-trust-child.fixture.ts", import.meta.url)),
      mode,
      f.filePath,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TSX_DISABLE_CACHE: "1",
        NODE_DISABLE_COMPILE_CACHE: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let stdout = "";
  let stderr = "";
  let released = false;
  let reportedFailure: string | undefined;
  child.stdout?.on("data", (value) => {
    stdout += String(value);
  });
  child.stderr?.on("data", (value) => {
    stderr += String(value);
  });
  const closed = new Promise<{ code: number | null; signal: string | null }>((accept) => {
    child.once("close", (code, signal) => accept({ code, signal }));
  });
  async function stop() {
    if (!released) {
      released = true;
      if (child.connected) child.send({ type: "release" });
    }
    let exit;
    try {
      exit = await guard(closed, 3000);
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await guard(closed, 3000);
      throw error;
    }
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.equal(reportedFailure, undefined);
    assert.equal(stdout, "");
    assert.equal(stderr, "");
  }
  f.beforeRemoval.push(stop);
  const ready = new Promise<{ pid: number; startTime: number }>((accept, reject) => {
    child.once("error", reject);
    child.on("message", (message) => {
      if (typeof message !== "object" || message === null || !("type" in message)) return;
      if (message.type === "failure" && "message" in message) {
        reportedFailure = String(message.message);
        reject(new Error(reportedFailure));
      }
      if (message.type === "ready" && "pid" in message && "startTime" in message) {
        assert.equal(message.pid, child.pid);
        assert.equal(typeof message.startTime, "number");
        accept({ pid: Number(message.pid), startTime: Number(message.startTime) });
      }
    });
  });
  const identity = await guard(ready, 8000);
  return {
    ...identity,
    stop,
    isHeld: () => !released && child.exitCode === null && child.signalCode === null,
  };
}
