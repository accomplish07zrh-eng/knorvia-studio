// SPDX-License-Identifier: Apache-2.0
// core-hooks 旧门：在旧实现上分别用源码入口与 dist 入口跑契约测试，生成 gate-old.json。
//
// 用法（仓库根目录）：
//   pnpm build:cli-packages
//   node apps/cli/packages/core/test/run-old-gate.mjs            # 旧门
//   node apps/cli/packages/core/test/run-old-gate.mjs --with-stubs  # 附带桩替换验证
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const testsDir = join(contractDir, "tests");
const distEntry = join(repoRoot, "apps/cli/packages/core/dist/hooks/index.js");

const contractVersion = "v1";
const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => join(testsDir, name));

function runContractTests(entryPath) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=60000", ...testFiles],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(entryPath ? { KNORVIA_CORE_HOOKS_ENTRY: entryPath } : {}),
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    entry: entryPath ? "dist" : "source",
    exitCode: result.status,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    outputTail: output.trim().split(/\r?\n/).slice(-12).join("\n"),
  };
}

function preRegisteredDifferences() {
  // 预登记差异由 known-differences.md 维护；旧门必须全过，因此这里应为空数组。
  return [];
}

const source = runContractTests(null);
const dist = runContractTests(distEntry);
const gate = {
  contract: "core-hooks",
  version: contractVersion,
  commit: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  generatedAt: new Date().toISOString(),
  testFiles: testFiles.map((file) => file.replace(`${repoRoot}/`, "").replace(/\\/gu, "/")),
  caseCount: source.tests,
  pass: source.pass,
  fail: source.fail,
  preRegisteredDifferences: preRegisteredDifferences(),
  entries: { source, dist },
  stubReplacement: null,
};

if (process.argv.includes("--with-stubs")) {
  execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--apply"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  try {
    const stubbed = runContractTests(null);
    gate.stubReplacement = {
      tests: stubbed.tests,
      pass: stubbed.pass,
      fail: stubbed.fail,
      allFail: stubbed.tests !== null && stubbed.pass === 0 && stubbed.fail === stubbed.tests,
    };
  } finally {
    execFileSync(process.execPath, [join(contractDir, "stubs/apply.mjs"), "--restore"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

writeFileSync(join(contractDir, "gate-old.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      commit: gate.commit,
      node: gate.node,
      source: { pass: source.pass, fail: source.fail },
      dist: { pass: dist.pass, fail: dist.fail },
      stubReplacement: gate.stubReplacement,
    },
    null,
    2,
  ),
);
