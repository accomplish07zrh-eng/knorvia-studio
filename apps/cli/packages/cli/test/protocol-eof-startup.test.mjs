// SPDX-License-Identifier: Apache-2.0
// 契约测试：stdin 在**启动期** EOF 时，app-server 仍必须以 0 退出。
//
// 缺陷背景：入口曾经在 stdin EOF 后 100ms 无条件 abort，而启动（读 db + 22 个 migration）
// 需要 1.4–1.5s，于是 abort 落在初始化中间——main.ts 的 throwIfAborted 抛出
// "Protocol input closed"，进程以 1 退出。Host 在异常收尾时关掉 stdin 就会看到这个假错误。
//
// 断言只走公开入口：spawn 真 CLI 产物、用真 stdio，不 import 任何内部实现文件。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/** CLI 产物与仓库根：从 test/ 往上五层（cli → packages → apps → 仓库根）。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const cliEntry = join(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");

/** 两条内核路径都要按同一语义退出：legacy 是默认路径，dsh 是新运行时路径。 */
const ENGINE_CASES = [
  ["legacy", { KNORVIA_KERNEL_ENGINE: "legacy" }],
  ["dsh", { KNORVIA_KERNEL_ENGINE: "dsh" }],
];

function makeTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function removeTempDir(directory) {
  await rm(directory, { recursive: true, force: true });
}

/** 干净环境：去掉 DSH_* 与引擎开关，再按用例覆盖；数据目录与 home 都指向临时根。 */
function kernelEnv({ dataBase, home, extra = {} }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.toUpperCase().startsWith("DSH_")) continue;
    if (key === "KNORVIA_KERNEL_ENGINE") continue;
    env[key] = value;
  }
  Object.assign(env, {
    KNORVIA_DATA_BASE_DIR: dataBase,
    HOME: home,
    USERPROFILE: home,
    ...extra,
  });
  return env;
}

/** spawn 真 CLI 产物并收集两个输出流；返回可等待的 exit。 */
function spawnCli(args, env) {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const state = { stderr: "", stdout: "" };
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
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  // 避免未等待的 rejection 影响测试进程。
  exit.catch(() => {});
  return { child, state, exit };
}

function withTimeout(promise, timeoutMs, label) {
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

/** stderr 尾部的可读摘要，失败时附在断言消息里。 */
function stderrTail(state) {
  return JSON.stringify(state.stderr.slice(-600));
}

for (const [label, extra] of ENGINE_CASES) {
  test(`stdio 启动期 stdin EOF（${label}）以 0 退出，不报 Protocol input closed`, async () => {
    const root = await makeTempDir(`cli-eof-${label}-`);
    try {
      const proc = spawnCli(
        ["app-server", "--stdio"],
        kernelEnv({ dataBase: join(root, "data"), home: join(root, "home"), extra }),
      );
      // 关键动作：启动还没完成就关掉 stdin——这正是 Host 异常收尾时的行为。
      proc.child.stdin.end();
      const { code, signal } = await withTimeout(
        proc.exit,
        60_000,
        `app-server（${label}）在启动期 EOF 后退出`,
      );
      assert.equal(signal, null, `不应被信号终止；stderr=${stderrTail(proc.state)}`);
      assert.equal(code, 0, `启动期 EOF 必须正常退出；stderr=${stderrTail(proc.state)}`);
      assert.equal(
        proc.state.stderr.includes("Protocol input closed"),
        false,
        `不应把输入结束当成故障；stderr=${stderrTail(proc.state)}`,
      );
    } finally {
      await removeTempDir(root);
    }
  });
}

test("stdio 启动期 EOF 后仍在硬上限内交付终态", async () => {
  // 反向断言：不再「EOF 立即 abort」之后，卡住的初始化也不能把进程永久挂住。
  const root = await makeTempDir("cli-eof-deadline-");
  try {
    const proc = spawnCli(
      ["app-server", "--stdio"],
      kernelEnv({
        dataBase: join(root, "data"),
        home: join(root, "home"),
        extra: { KNORVIA_KERNEL_ENGINE: "legacy" },
      }),
    );
    const endedAt = Date.now();
    proc.child.stdin.end();
    const { code } = await withTimeout(proc.exit, 60_000, "app-server 在硬上限内退出");
    // 硬上限是 1500ms；进程启动与模块加载另算，给足余量但足以证明「不是永远挂着」。
    assert.ok(Date.now() - endedAt < 30_000, `退出耗时 ${Date.now() - endedAt}ms 超出合理上界`);
    assert.equal(code, 0, `stderr=${stderrTail(proc.state)}`);
  } finally {
    await removeTempDir(root);
  }
});
