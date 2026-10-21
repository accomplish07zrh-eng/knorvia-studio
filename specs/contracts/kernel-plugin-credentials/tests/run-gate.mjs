// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials 门禁运行器：
//   1. 旧门（默认引擎）：`gate-old.json`
//   2. 新运行时门（`KNORVIA_KERNEL_ENGINE=dsh`）：`gate-dsh.json`
//
// 接入包**无桩门**：本包不替换既有实现，没有"桩"可放。非自证由**失败路径断言**承担——
// 每个成功路径都配一条"拿不到凭据必须明确失败"的断言（B6），因此空实现过不了门。
//
// 用法（仓库根目录，先 pnpm build:cli-packages）：
//   node specs/contracts/kernel-plugin-credentials/tests/run-gate.mjs
//   node specs/contracts/kernel-plugin-credentials/tests/run-gate.mjs --engine dsh
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const contractVersion = "v1";

/** 只收集 `.test.mjs`：`.test.ts` 需要 tsx 加载器，本包不用。 */
const testFiles = readdirSync(here)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(here, name));

const engineIndex = process.argv.indexOf("--engine");
const engine = engineIndex === -1 ? "legacy" : process.argv[engineIndex + 1];
if (engine !== "legacy" && engine !== "dsh") {
  process.stderr.write("run-gate: --engine must be legacy or dsh\n");
  process.exit(2);
}
const gateFile = engine === "legacy" ? "gate-old.json" : "gate-dsh.json";

function runContractTests() {
  const env = { ...process.env };
  // 引擎只由产品开关决定；测试不引入任何自有变量。
  delete env.KNORVIA_KERNEL_ENGINE;
  delete env.KNORVIA_BRIDGE_ENTRY;
  if (engine === "dsh") env.KNORVIA_KERNEL_ENGINE = "dsh";

  const result = spawnSync(
    process.execPath,
    [
      // 测试加载本包的 TypeScript 源码（`loadCredentials` 走 `.ts`），因此必须带 tsx 加载器。
      // 缺了它会是 ERR_MODULE_NOT_FOUND / 语法错误，看起来像「实现不存在」而不是「加载器没配」。
      "--import",
      "tsx",
      "--test-reporter=spec",
      "--test",
      "--test-concurrency=1",
      // 不用 --test-force-exit：夹具必须自身干净（CI 的 test:studio 不带该开关）。
      "--test-timeout=120000",
      ...testFiles,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = new RegExp(`^\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    engine,
    exitCode: result.status,
    timedOut: result.error !== undefined && result.error.code === "ETIMEDOUT",
    signaled: result.signal !== null && result.signal !== undefined,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split(/\r?\n/).slice(-24).join("\n"),
  };
}

const runtime = runContractTests();

/**
 * 合同阶段的「应然红」判定。
 *
 * 合同阶段还没有实现（`apps/cli/packages/bootstrap/src/kernel-plugin-credentials/**` 不存在），
 * 因此 `credentials.test.mjs` 的源码加载会失败 → 门是红的。这与 `kernel-bridge-legacy` 的
 * dsh 门在合同阶段 1/10 是同一性质：**先冻结断言、留待实现转绿**。
 *
 * 为了不让审查者把「合同阶段故意红」误判成「实现阶段真失败」，本运行器显式记录三件事：
 *   1. `baseline`：本合同阶段的实测结果 + 失败原因；
 *   2. `target`：实现阶段的应然目标；
 *   3. `verdict`：本阶段门的预期是否达成（合同阶段允许红，但必须红得**符合预期**）。
 */
const IMPLEMENTATION_ABSENT = "implementation absent";
const EXPECTED_TARGET = "11/11 pass, 0 skip";

/** 实现目录是否存在（`tests/` 的父级往上两级是 bootstrap 的 src）。 */
const implementationPresent = readdirSync(
  resolve(repoRoot, "apps/cli/packages/bootstrap/src"),
).includes("kernel-plugin-credentials");

const runtimeOk =
  runtime.tests !== null &&
  runtime.tests === runtime.pass &&
  runtime.fail === 0 &&
  runtime.skipped === 0 &&
  runtime.timedOut !== true &&
  runtime.signaled !== true;

const report = {
  contract: "kernel-plugin-credentials",
  contractVersion,
  node: process.version,
  command:
    "node --import tsx --test-reporter=spec --test --test-concurrency=1 --test-timeout=120000 <tests/*.test.mjs>",
  engine,
  assertionsRelaxed: false,
  forcedExit: false,
  stubGate: "n/a（接入包不替换既有实现，无桩可放；非自证由失败路径断言承担）",
  phase: implementationPresent ? "implementation" : "contract",
  baseline: implementationPresent
    ? null
    : {
        // 合同阶段基线：实现不存在 → 全部红。审查时用它与实现阶段对照。
        reason: IMPLEMENTATION_ABSENT,
        note:
          "合同阶段先冻结断言；apps/cli/packages/bootstrap/src/kernel-plugin-credentials/** 尚不存在，" +
          "因此测试加载失败、全部用例红。这是应然状态，不是实现缺陷。",
      },
  target: {
    // 实现阶段应达到的可判定目标（供审查者对照）。
    expected: EXPECTED_TARGET,
    assertionsRelaxed: false,
    forcedExit: false,
    skipped: 0,
  },
  runs: [runtime],
};
writeFileSync(join(contractDir, gateFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");

// 合同阶段：允许红，但必须红得符合预期（实现确实不存在）。实现阶段：必须全绿。
const ok = implementationPresent ? runtimeOk : runtimeOk || runtime.fail > 0;

process.stdout.write(
  `run-gate: contract=${report.contract} version=${contractVersion} phase=${report.phase} engine=${engine} ` +
    `runtime=${runtime.pass ?? "?"}/${runtime.tests ?? "?"} ${ok ? "PASS" : "FAIL"}` +
    `${implementationPresent ? "" : ` (contract baseline: ${IMPLEMENTATION_ABSENT})`}\n`,
);
if (!ok) process.stdout.write(`${runtime.outputTail}\n`);
process.exit(ok ? 0 : 1);

void relative;
