// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B23/B24：本包追加的组合行不得污染默认引擎路径。
// 合同阶段即可通过：默认路径根本不加载 kernel 与任何 DSH 模块。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cliEntry, repoRootPath } from "./entry.mjs";

const BASELINE_COMMANDS = [["version"], ["help"]];

function runCli(args, env) {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd: repoRootPath,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const state = { stdout: "", stderr: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });
  const exit = new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code));
  });
  return { state, exit };
}

/** 基线环境：清掉引擎开关与本机 DSH 痕迹，避免开发机环境泄漏。 */
function baseEnvironment(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === "KNORVIA_KERNEL_ENGINE") continue;
    if (key.toUpperCase().startsWith("DSH_")) continue;
    env[key] = value;
  }
  return Object.assign(env, extra);
}

test("B24 带与不带 dsh 引擎开关时 version/help 输出一致且无就绪标记", async () => {
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-default-"));
  try {
    const dataBase = join(root, "base");
    for (const args of BASELINE_COMMANDS) {
      const plain = runCli(args, baseEnvironment({ KNORVIA_DATA_BASE_DIR: dataBase }));
      const dsh = runCli(
        args,
        baseEnvironment({ KNORVIA_DATA_BASE_DIR: dataBase, KNORVIA_KERNEL_ENGINE: "dsh" }),
      );
      const [plainExit, dshExit] = await Promise.all([plain.exit, dsh.exit]);
      assert.equal(plainExit, 0, `baseline ${args.join(" ")} must exit 0`);
      assert.equal(dshExit, 0, `${args.join(" ")} with engine=dsh must exit 0`);
      assert.equal(
        dsh.state.stdout,
        plain.state.stdout,
        `${args.join(" ")} 的 stdout 必须与基线逐字节一致`,
      );
      for (const { state, label } of [
        { state: plain.state, label: "baseline" },
        { state: dsh.state, label: "engine=dsh" },
      ]) {
        assert.equal(
          /knorvia-kernel-(?:ready|failed)/u.test(state.stderr),
          false,
          `${label} 的 ${args.join(" ")} 不得出现内核就绪/失败标记`,
        );
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("B23 version/help 不创建 DSH_HOME（本包组合行未污染默认路径）", async () => {
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-home-"));
  try {
    const dataBase = join(root, "base");
    const run = runCli(["version"], baseEnvironment({ KNORVIA_DATA_BASE_DIR: dataBase }));
    const code = await run.exit;
    assert.equal(code, 0);
    const dshHome = join(dataBase, ".knorvia-studio", "dsh");
    assert.equal(existsSync(dshHome), false, `默认路径不得创建 ${dshHome}（version 不启动内核）`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
