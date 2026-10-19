// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 进程级契约测试的共享工具：只依赖公开 CLI 产物与临时目录，不 import 内部实现。
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliEntry, repoRoot } from "./entry.mjs";

export const KERNEL_READY = "knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2";
export const KERNEL_FAILED = "knorvia-kernel-failed engine=dsh reason=";

export function makeTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

export function removeTempDir(directory) {
  return rm(directory, { recursive: true, force: true });
}

export function kernelEnv({ dataBase, home, extra = {} }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.toUpperCase().startsWith("DSH_")) continue;
    if (key === "KNORVIA_KERNEL_ENGINE") continue;
    env[key] = value;
  }
  Object.assign(env, {
    KNORVIA_DATA_BASE_DIR: dataBase,
    KNORVIA_KERNEL_ENGINE: "dsh",
    HOME: home,
    USERPROFILE: home,
  });
  Object.assign(env, extra);
  return env;
}

export function spawnCli(args, env) {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const state = { stdout: "", stderr: "", exited: false, code: undefined, signal: undefined };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });
  const exit = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      state.exited = true;
      state.code = code;
      state.signal = signal;
      resolveExit({ code, signal });
    });
  });
  // 避免未等待的 rejection 影响测试进程。
  exit.catch(() => {});

  return {
    child,
    state,
    exit,
    waitForStderr(text, timeoutMs = 30_000) {
      return waitForText(child.stderr, state, "stderr", text, exit, timeoutMs);
    },
  };
}

function waitForText(stream, state, key, text, exit, timeoutMs) {
  if (state[key].includes(text)) return Promise.resolve();
  return new Promise((resolveWait, rejectWait) => {
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.off("data", check);
      settle(value);
    };
    const check = () => {
      if (state[key].includes(text)) finish(resolveWait);
    };
    const timer = setTimeout(
      () =>
        finish(
          rejectWait,
          new Error(
            `timed out waiting for ${JSON.stringify(text)} on ${key}; tail=${JSON.stringify(
              state[key].slice(-600),
            )}`,
          ),
        ),
      timeoutMs,
    );
    stream.on("data", check);
    exit.then(
      () => {
        if (state[key].includes(text)) finish(resolveWait);
        else
          finish(
            rejectWait,
            new Error(
              `exited before ${JSON.stringify(text)}; ${key}=${JSON.stringify(state[key])}`,
            ),
          );
      },
      (error) => finish(rejectWait, error),
    );
  });
}

export function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}
