// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy 门禁运行器：
//   1. 默认引擎（无 KNORVIA_KERNEL_ENGINE）全过 → gate-old.json
//   2. 同一套用例在 KNORVIA_KERNEL_ENGINE=dsh 下复跑 → gate-dsh.json（实现阶段判据）
//   3. 只回 Method not found 的桩上全部失败 → stub-gate.json
//
// 用法（仓库根目录，先 pnpm build:cli-packages）：
//   node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs             # 旧门 + 桩门
//   node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs --engine dsh # 新运行时门 + 桩门
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const testsDir = join(contractDir, "tests");
const stubEntry = relative(repoRoot, join(contractDir, "stubs/app-server-stub.mjs"));
const contractVersion = "v1";

const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(testsDir, name));

const engineIndex = process.argv.indexOf("--engine");
const engine = engineIndex === -1 ? "legacy" : process.argv[engineIndex + 1];
if (engine !== "legacy" && engine !== "dsh") {
  process.stderr.write("run-gate: --engine must be legacy or dsh\n");
  process.exit(2);
}
const gateFile = engine === "legacy" ? "gate-old.json" : "gate-dsh.json";

function baseEnv() {
  const env = { ...process.env };
  delete env.KNORVIA_BRIDGE_ENTRY;
  // 引擎只由产品开关决定；测试不引入任何自有变量。
  delete env.KNORVIA_KERNEL_ENGINE;
  return env;
}

function runContractTests(entry) {
  const env = baseEnv();
  if (entry === "stub") env.KNORVIA_BRIDGE_ENTRY = stubEntry;
  else if (engine === "dsh") env.KNORVIA_KERNEL_ENGINE = "dsh";

  const result = spawnSync(
    process.execPath,
    [
      "--test-reporter=spec",
      "--test",
      "--test-concurrency=1",
      // 不用 --test-force-exit：夹具自己保证自然退出（见 _protocol.mjs 的 registerCleanup）。
      // CI 的 test:studio 直接跑这些 .test.mjs、不带任何强制退出开关，所以夹具必须自身干净。
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
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    entry,
    engine: entry === "stub" ? "stub" : engine,
    exitCode: result.status,
    timedOut: result.error !== undefined && result.error.code === "ETIMEDOUT",
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split(/\r?\n/).slice(-24).join("\n"),
  };
}

const runtime = runContractTests("dist");
const stub = runContractTests("stub");

const report = {
  contract: "kernel-bridge-legacy",
  contractVersion,
  node: process.version,
  command:
    "node --test-reporter=spec --test --test-concurrency=1 --test-timeout=120000 <tests/*.test.mjs>",
  engine,
  assertionsRelaxed: false,
  forcedExit: false,
  runs: [runtime],
};
writeFileSync(join(contractDir, gateFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const stubGate = {
  allFail: stub.pass === 0 && (stub.fail ?? 0) > 0,
  ...stub,
  note: "桩只复述 NDJSON transport 外壳（按 id 回 Method not found），不含任何旧协议方法或通知语义",
};
writeFileSync(
  join(contractDir, "stub-gate.json"),
  `${JSON.stringify(stubGate, null, 2)}\n`,
  "utf8",
);

// 挂死也算失败：夹具若重新引入「清理被跳过」的形态，这里必须红，而不是无限等待。
const runtimeOk =
  runtime.tests !== null &&
  runtime.tests === runtime.pass &&
  runtime.fail === 0 &&
  runtime.timedOut !== true;
const ok = runtimeOk && stubGate.allFail;
process.stdout.write(
  `run-gate: contract=${report.contract} version=${contractVersion} engine=${engine} ` +
    `runtime=${runtime.pass ?? "?"}/${runtime.tests ?? "?"} ` +
    `stub=${stub.pass ?? "?"}/${stub.tests ?? "?"} ${ok ? "PASS" : "FAIL"}\n`,
);
if (!ok) {
  process.stdout.write(`${runtime.outputTail}\n--- stub ---\n${stub.outputTail}\n`);
}
process.exit(ok ? 0 : 1);
