// SPDX-License-Identifier: Apache-2.0
// node-repl-host-broker 旧门：在当前实现上跑契约测试并生成 gate-old.json。
//
// 本包没有独立 dist 模块：node-repl-host 只产出 dist-types 声明，并用 esbuild 把
// src/server.ts 打成单个 dist/mcp/server.js；broker-transaction 不在 package exports 中。
// 因此旧门只有源码入口，dist 入口记录为 null 并说明原因。
//
// 用法（仓库根目录）：
//   node specs/contracts/node-repl-host-broker/tests/run-old-gate.mjs
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

function runContractTests() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=60000", ...testFiles],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    entry: "source",
    exitCode: result.status,
    tests: count("tests"),
    pass: count("pass"),
    fail: count("fail"),
    skipped: count("skipped"),
    outputTail: output.trim().split(/\r?\n/).slice(-12).join("\n"),
  };
}

const source = runContractTests();
const gate = {
  contract: "node-repl-host-broker",
  version: contractVersion,
  commit: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  generatedAt: new Date().toISOString(),
  testFiles: testFiles.map((file) => file.replace(`${repoRoot}/`, "").replace(/\\/gu, "/")),
  caseCount: source.tests,
  pass: source.pass,
  fail: source.fail,
  preRegisteredDifferences: [],
  entries: { source, dist: null },
  distNote:
    "No standalone dist module: the package emits declarations to dist-types and bundles src/server.ts to dist/mcp/server.js; broker-transaction is not a package export.",
};

writeFileSync(join(contractDir, "gate-old.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      commit: gate.commit,
      node: gate.node,
      source: { pass: source.pass, fail: source.fail },
      dist: null,
    },
    null,
    2,
  ),
);
