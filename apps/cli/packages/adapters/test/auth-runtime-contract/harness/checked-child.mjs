// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export function checkedChild(args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let captured = 0;
    let overflowed = false;
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, overflowed, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const capture = (target, chunk) => {
      const value = String(chunk);
      captured += Buffer.byteLength(value);
      if (captured > MAX_CAPTURE_BYTES) {
        overflowed = true;
        child.kill();
        return;
      }
      if (target === "stdout") stdout += value;
      else stderr += value;
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => capture("stdout", chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => capture("stderr", chunk));
    child.once("error", (error) => finish({ exitCode: null, signal: null, error: error.message }));
    child.once("close", (exitCode, signal) => finish({ exitCode, signal }));
  });
}
