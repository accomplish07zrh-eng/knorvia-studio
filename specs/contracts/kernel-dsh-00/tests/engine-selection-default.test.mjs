// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 合同测试 T1/T2：默认路径不因引擎开关改变，也不触碰 DSH_HOME。
// 只走公开 CLI 入口（dist/knorvia.cjs），不 import 任何内部模块。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliEntry = resolve(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");

function runCli(args, env) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, `CLI 启动失败：${String(result.error)}`);
  return result;
}

test("T1 version 命令带 KNORVIA_KERNEL_ENGINE=dsh 仍走旧路径，不写就绪标记、不建 DSH_HOME", () => {
  assert.equal(existsSync(cliEntry), true, `缺少构建产物：${cliEntry}`);
  const root = mkdtempSync(join(tmpdir(), "kernel-dsh-t1-"));
  const dshHome = join(root, "dsh");
  try {
    const result = runCli(["version"], {
      ...process.env,
      KNORVIA_KERNEL_ENGINE: "dsh",
      DSH_HOME: dshHome,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
    assert.equal(result.stderr.includes("knorvia-kernel-"), false);
    assert.equal(existsSync(dshHome), false, "默认命令不得创建 DSH_HOME");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("T2 help 命令带任意引擎值都不产生内核标记，也不建 DSH_HOME", () => {
  assert.equal(existsSync(cliEntry), true, `缺少构建产物：${cliEntry}`);
  for (const value of ["dsh", "DSH", "legacy", " dsh "]) {
    const root = mkdtempSync(join(tmpdir(), "kernel-dsh-t2-"));
    const dshHome = join(root, "dsh");
    try {
      const result = runCli(["help"], {
        ...process.env,
        KNORVIA_KERNEL_ENGINE: value,
        DSH_HOME: dshHome,
      });
      assert.equal(result.status, 0, `help 在 ${JSON.stringify(value)} 下应成功`);
      assert.ok(result.stdout.length > 0);
      assert.equal(result.stderr.includes("knorvia-kernel-"), false);
      assert.equal(
        existsSync(dshHome),
        false,
        `help 在 ${JSON.stringify(value)} 下不得创建 DSH_HOME`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
