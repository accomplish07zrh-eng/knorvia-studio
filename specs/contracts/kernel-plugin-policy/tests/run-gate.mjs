// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy 门禁入口：旧门（默认引擎）+ 新运行时门（KNORVIA_KERNEL_ENGINE=dsh）。
//
// 契约依据：specs/contracts/kernel-plugin-policy/acceptance.md §4、README §八。
//
// 为什么需要这个入口（而不是只跑 `node --test`）：门禁的产物是**可归档的资产** ——
// `gate-old.json` / `gate-dsh.json` 记录「某次运行在哪个引擎、哪个提交上、多少个用例通过」。
// 只跑 `node --test` 得不到这份记录，也就无法在验收文档里引用。
//
// 用法（仓库根）：
//   node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs
//   node specs/contracts/kernel-plugin-policy/tests/run-gate.mjs --engine dsh
//
// 判据：全部用例通过；退出码 0。产物写在合同目录下的 gate-<engine>.json。

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = resolve(HERE, "..");
/** 仓库根：合同目录在 `<root>/specs/contracts/<name>`，所以上溯三层。 */
const REPO_ROOT = resolve(CONTRACT_DIR, "..", "..", "..");

const TEST_FILE = "apps/cli/packages/bootstrap/test/kernel-plugin-policy.test.ts";

/** 支持的引擎值（与 `bootstrap/src/kernel/engine.ts` 的取值一致）。 */
const ENGINE_LEGACY = "legacy";
const ENGINE_DSH = "dsh";

/** 解析 `--engine <legacy|dsh>`；缺省 legacy。 */
function parseEngine(argv) {
  const index = argv.indexOf("--engine");
  if (index < 0) return ENGINE_LEGACY;
  const value = argv[index + 1];
  if (value !== ENGINE_LEGACY && value !== ENGINE_DSH) {
    throw new Error(
      `--engine must be "${ENGINE_LEGACY}" or "${ENGINE_DSH}", got "${String(value)}"`,
    );
  }
  return value;
}

/**
 * 跑测试并解析 node:test 的汇总行。
 *
 * 用 `--test-reporter=tap` 会得到更结构化的输出，但这里只要四个计数，
 * 从默认 reporter 的 `ℹ tests N` 一类行里取即可（与 CI 看到的输出一致）。
 */
function runTests(engine) {
  const env = { ...process.env };
  if (engine === ENGINE_DSH) {
    env.KNORVIA_KERNEL_ENGINE = ENGINE_DSH;
  } else {
    delete env.KNORVIA_KERNEL_ENGINE;
  }

  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, ["--import", "tsx", "--test", TEST_FILE], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    stdout = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    exitCode = typeof error.status === "number" ? error.status : 1;
  }

  /** 从汇总行取一个计数。 */
  const countOf = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(stdout);
    return match === null ? 0 : Number(match[1]);
  };

  return {
    exitCode,
    totals: {
      tests: countOf("tests"),
      suites: countOf("suites"),
      pass: countOf("pass"),
      fail: countOf("fail"),
      cancelled: countOf("cancelled"),
      skipped: countOf("skipped"),
      todo: countOf("todo"),
    },
    // 只留失败行的摘要，避免把整份输出塞进产物。
    failures: stdout
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("\u2716 ") || line.includes("AssertionError"))
      .slice(0, 40),
  };
}

/** 当前提交（产物要能对应到代码版本）。 */
function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const engine = parseEngine(process.argv.slice(2));
const result = runTests(engine);

const passed = result.totals.fail === 0 && result.exitCode === 0;
const report = {
  contract: "kernel-plugin-policy",
  contractVersion: "v1",
  engine,
  // 新运行时门必须显式标注「这一侧只覆盖离线判定」，因为真实交互归 kernel-switch。
  scope:
    engine === ENGINE_DSH
      ? "offline policy decisions under KNORVIA_KERNEL_ENGINE=dsh"
      : "offline policy decisions on the default engine",
  testFile: TEST_FILE,
  commit: currentCommit(),
  ranAt: new Date().toISOString(),
  node: process.version,
  totals: result.totals,
  verdict: passed ? "pass" : "fail",
  ...(result.failures.length === 0 ? {} : { failures: result.failures }),
};

const outPath = join(CONTRACT_DIR, `gate-${engine}.json`);
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

process.stdout.write(
  `kernel-plugin-policy gate (${engine}): ${report.verdict.toUpperCase()} ` +
    `— ${result.totals.pass}/${result.totals.tests} passed, ${result.totals.fail} failed\n` +
    `wrote ${outPath}\n`,
);
if (!passed) {
  for (const failure of result.failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
}

void readFileSync;
