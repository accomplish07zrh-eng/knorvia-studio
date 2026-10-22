#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind 合同门禁：跑 B1–B12 的 34 个用例并产出机器可读的 gate 报告。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/acceptance.md §4
//
// 用法：
//   node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs              # 默认引擎
//   node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs --engine dsh # 新运行时门
//
// **为什么两门跑同一套用例**：本包是 engine-agnostic 的（不读 KNORVIA_KERNEL_ENGINE），
// 所以两门的差别只是「记录哪个引擎下跑的」，用例本身必须都过。
// 真正的引擎分流在 `apps/cli/packages/cli/src/run.ts:255`，legacy 路径根本不加载本包。

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const CONTRACT_DIR = join(REPO_ROOT, "specs", "contracts", "kernel-plugin-rewind");
const TEST_FILE = join(
  REPO_ROOT,
  "apps",
  "cli",
  "packages",
  "bootstrap",
  "test",
  "kernel-plugin-rewind.test.ts",
);

/** 解析 `--engine`。 */
function parseEngine(argv) {
  const index = argv.indexOf("--engine");
  if (index === -1) return "legacy";
  const value = argv[index + 1];
  if (value !== "legacy" && value !== "dsh") {
    console.error(`unknown --engine value: ${String(value)} (expected "legacy" or "dsh")`);
    process.exit(2);
  }
  return value;
}

/** 取当前 git 提交（短 sha）。没有 git 时记为 unknown。 */
function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

const engine = parseEngine(process.argv);

/** 跑测试并解析 node:test 的汇总行。 */
function runTests() {
  // 用 node 的 test runner 直接跑 tsx 转译的用例；stdout 全量捕获后解析。
  const output = execFileSync(process.execPath, ["--import", "tsx", "--test", TEST_FILE], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output;
}

let rawOutput = "";
let failed = false;
try {
  rawOutput = runTests();
} catch (error) {
  // 测试失败时 execFileSync 抛错，但错误对象里带着 stdout。
  failed = true;
  rawOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

/** 从输出里读 `ℹ tests N` / `ℹ pass N` / `ℹ fail N`。 */
function readCount(label) {
  const match = rawOutput.match(new RegExp(`\\u2139 ${label} (\\d+)`, "u"));
  return match === null ? 0 : Number(match[1]);
}

const totals = { tests: readCount("tests"), pass: readCount("pass"), fail: readCount("fail") };
const verdict = failed || totals.fail > 0 || totals.pass !== totals.tests ? "fail" : "pass";

const report = {
  contract: "kernel-plugin-rewind",
  contractVersion: "v1",
  engine,
  scope:
    "Offline contract tests over the public plugin entry with in-memory port doubles. " +
    "Does not cover the real filesystem, the real artifact store, or a real session fork.",
  testFile: "apps/cli/packages/bootstrap/test/kernel-plugin-rewind.test.ts",
  commit: currentCommit(),
  ranAt: new Date().toISOString(),
  node: process.version,
  totals,
  verdict,
};

mkdirSync(CONTRACT_DIR, { recursive: true });
const fileName = engine === "dsh" ? "gate-dsh.json" : "gate-legacy.json";
writeFileSync(join(CONTRACT_DIR, fileName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `kernel-plugin-rewind gate (${engine}): ${verdict} — ` +
    `${totals.pass}/${totals.tests} passed, ${totals.fail} failed`,
);
process.exit(verdict === "pass" ? 0 : 1);
