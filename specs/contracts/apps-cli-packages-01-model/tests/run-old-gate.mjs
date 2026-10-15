// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 旧门：在旧实现（源码入口与 dist 入口）上跑契约测试，生成 gate-old.json；
// --with-stubs 附带桩替换验证（应 0 通过 / 全失败），结果写 stub-gate.json。
//
// 用法（仓库根目录，先跑 pnpm build:cli-packages 生成 dist）：
//   node --import tsx specs/contracts/apps-cli-packages-01-model/tests/run-old-gate.mjs
//   node --import tsx specs/contracts/apps-cli-packages-01-model/tests/run-old-gate.mjs --with-stubs
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const testsDir = join(contractDir, "tests");
const contractVersion = "v1";
const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => join(testsDir, name));

function runContractTests(entry) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=120000", ...testFiles],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        KNORVIA_ADAPTERS_ENTRY: entry === "dist" ? "dist" : "source",
      },
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    entry,
    exitCode: result.status,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
    outputTail: output.trim().split(/\r?\n/).slice(-12).join("\n"),
  };
}

function applyStubs(mode) {
  execFileSync(
    process.execPath,
    [join(contractDir, "stubs/apply.mjs"), mode === "apply" ? "--apply" : "--restore"],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

const source = runContractTests("source");
const dist = runContractTests("dist");
const report = {
  contract: "apps-cli-packages-01-model",
  contractVersion,
  node: process.version,
  command: "node --import tsx --test --test-concurrency=1 --test-timeout=120000 <tests/*.test.ts>",
  preregisteredDifferences: 0,
  assertionsRelaxed: false,
  runs: [source, dist],
};
writeFileSync(join(contractDir, "gate-old.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

let stubGate = null;
if (process.argv.includes("--with-stubs")) {
  applyStubs("apply");
  const stubbed = runContractTests("source");
  applyStubs("restore");
  stubGate = {
    allFail: stubbed.pass === 0 && (stubbed.fail ?? 0) > 0,
    ...stubbed,
    note: "桩只含 interface.md 导出与签名；纯类型模块的用例随所在用例整体失败（见 known-differences 第二节）",
  };
  writeFileSync(
    join(contractDir, "stub-gate.json"),
    `${JSON.stringify(stubGate, null, 2)}\n`,
    "utf8",
  );
}

const ok =
  source.tests === source.pass &&
  source.fail === 0 &&
  dist.tests === dist.pass &&
  dist.fail === 0 &&
  (stubGate === null || stubGate.allFail);
process.stdout.write(
  `run-old-gate: contract=${report.contract} version=${contractVersion} ` +
    `source=${source.pass}/${source.tests} dist=${dist.pass}/${dist.tests} ` +
    `stubs=${stubGate ? `${stubGate.pass}/${stubGate.tests}` : "skipped"} ${ok ? "PASS" : "FAIL"}\n`,
);
process.exit(ok ? 0 : 1);
