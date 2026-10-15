// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 旧门：在旧实现（源码入口与 dist 入口）上跑契约测试，生成 gate-old.json。
//
// 用法（仓库根目录，先跑 pnpm build:cli-packages 生成 dist）：
//   node specs/contracts/apps-cli-packages-01/tests/run-old-gate.mjs                 # 旧门（两种入口）
//   node specs/contracts/apps-cli-packages-01/tests/run-old-gate.mjs --with-stubs    # 附带桩替换验证
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const testsDir = join(contractDir, "tests");
const distEntry = join(repoRoot, "apps/cli/packages/adapters/dist/index.js");

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
        ...(entry === "dist"
          ? { KNORVIA_ADAPTERS_ENTRY: "dist" }
          : { KNORVIA_ADAPTERS_ENTRY: "source" }),
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
    outputTail: output.trim().split(/\r?\n/).slice(-14).join("\n"),
  };
}

function lintWarnings() {
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, "node_modules/oxlint/bin/oxlint"),
      "--config",
      join(repoRoot, ".oxlintrc.json"),
      "src",
    ],
    {
      cwd: join(repoRoot, "apps/cli/packages/adapters"),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const warnings = Number(/(\d+)\s+warning/u.exec(output)?.[1] ?? 0);
  const errors = Number(/(\d+)\s+error/u.exec(output)?.[1] ?? 0);
  return {
    command:
      "node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src (cwd apps/cli/packages/adapters)",
    warnings,
    errors,
    outputTail: output.trim().split(/\r?\n/).slice(-6).join("\n"),
  };
}

if (!existsSync(distEntry)) {
  throw new Error(`dist 入口不存在：${distEntry}（先跑 pnpm build:cli-packages）`);
}

const source = runContractTests("source");
const dist = runContractTests("dist");
const gate = {
  contract: "apps-cli-packages-01",
  version: contractVersion,
  commit: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  generatedAt: new Date().toISOString(),
  testFiles: testFiles.map((file) => file.replace(`${repoRoot}/`, "").replace(/\\/gu, "/")),
  caseCount: source.tests,
  pass: source.pass,
  fail: source.fail,
  preRegisteredDifferences: [],
  assertionsRelaxed: false,
  entries: { source, dist },
  stubReplacement: null,
  stubLint: null,
};

if (process.argv.includes("--with-stubs")) {
  execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--apply"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  try {
    const stubbed = runContractTests("source");
    gate.stubReplacement = {
      tests: stubbed.tests,
      pass: stubbed.pass,
      fail: stubbed.fail,
      allFail: stubbed.tests !== null && stubbed.pass === 0 && stubbed.fail === stubbed.tests,
      outputTail: stubbed.outputTail,
    };
    gate.stubLint = lintWarnings();
  } finally {
    execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--restore"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

writeFileSync(join(contractDir, "gate-old.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
// 给自动化核对器（lead/verify-replace.mjs）一行机器可读的结论：两种入口都必须 fail 0。
console.log(`contract source ${source.pass}/${source.tests} fail ${source.fail}`);
console.log(`contract dist ${dist.pass}/${dist.tests} fail ${dist.fail}`);
console.log(
  JSON.stringify(
    {
      commit: gate.commit,
      node: gate.node,
      source: {
        tests: source.tests,
        pass: source.pass,
        fail: source.fail,
        skipped: source.skipped,
      },
      dist: { tests: dist.tests, pass: dist.pass, fail: dist.fail, skipped: dist.skipped },
      stubReplacement: gate.stubReplacement,
      stubLint: gate.stubLint,
    },
    null,
    2,
  ),
);
