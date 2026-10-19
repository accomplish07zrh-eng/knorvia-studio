// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01 旧门：同一套 v4 公开入口用例
//   1. 对现有旧运行时（默认引擎）全过 → gate-old.json
//   2. 对只实现 transport 签名的桩全失败 → stub-gate.json
// 实施阶段用 --engine dsh 把用例原样指向 DSH 运行时（写 gate-dsh.json）。
//
// 用法（仓库根目录，先跑 pnpm build:cli-packages 生成 dist）：
//   node specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs
//   node specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs --engine dsh
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
  process.stderr.write("run-old-gate: --engine must be legacy or dsh\n");
  process.exit(2);
}
const gateFile = engine === "legacy" ? "gate-old.json" : "gate-dsh.json";

function baseEnv() {
  const env = { ...process.env };
  delete env.KNORVIA_BRIDGE_ENTRY;
  delete env.KNORVIA_BRIDGE_ENGINE;
  delete env.KNORVIA_KERNEL_ENGINE;
  return env;
}

function runContractTests(entry) {
  const env = baseEnv();
  if (entry === "stub") {
    env.KNORVIA_BRIDGE_ENTRY = stubEntry;
  } else if (engine === "dsh") {
    env.KNORVIA_BRIDGE_ENGINE = "dsh";
  }
  const result = spawnSync(
    process.execPath,
    [
      "--test-reporter=spec",
      "--test",
      "--test-concurrency=1",
      "--test-timeout=120000",
      ...testFiles,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
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
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split(/\r?\n/).slice(-16).join("\n"),
  };
}

const runtime = runContractTests("dist");
const stub = runContractTests("stub");

const report = {
  contract: "kernel-bridge-01",
  contractVersion,
  node: process.version,
  command:
    "node --test-reporter=spec --test --test-concurrency=1 --test-timeout=120000 <tests/*.test.mjs>",
  engine,
  assertionsRelaxed: false,
  runs: [runtime],
};
writeFileSync(join(contractDir, gateFile), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const stubGate = {
  allFail: stub.pass === 0 && (stub.fail ?? 0) > 0,
  ...stub,
  note: "桩只实现 app-server --stdio 的 transport 签名（按 id 回 Method not found），不含任何 v4 方法或帧语义",
};
writeFileSync(
  join(contractDir, "stub-gate.json"),
  `${JSON.stringify(stubGate, null, 2)}\n`,
  "utf8",
);

const runtimeOk = runtime.tests !== null && runtime.tests === runtime.pass && runtime.fail === 0;
const ok = runtimeOk && stubGate.allFail;
process.stdout.write(
  `run-old-gate: contract=${report.contract} version=${contractVersion} engine=${engine} ` +
    `runtime=${runtime.pass ?? "?"}/${runtime.tests ?? "?"} ` +
    `stub=${stub.pass ?? "?"}/${stub.tests ?? "?"} ${ok ? "PASS" : "FAIL"}\n`,
);
if (!ok) process.stdout.write(`${runtime.outputTail}\n--- stub ---\n${stub.outputTail}\n`);
process.exit(ok ? 0 : 1);
