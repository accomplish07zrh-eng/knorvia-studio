// SPDX-License-Identifier: Apache-2.0
// core-03 旧门：源码入口 / dist 入口跑契约测试，再把 35 个目标文件换成抛错桩重跑（要求全失败），
// 最后写 gate-old.json。桩只在跑动期间替换，结束必定还原（try/finally）。
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "../../../../");
const coreRoot = resolve(repoRoot, "apps/cli/packages/core");
const testsDir = here;
const stubNotice = 'throw new Error("not implemented: core-03");\n';
const backupDir = join(tmpdir(), `core03-stub-backup-${process.pid}`);

const targetFiles = readFileSync(join(here, "targets.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

function listTests() {
  return readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => join(testsDir, name));
}

function runTests(entryOverride) {
  const env = { ...process.env };
  if (entryOverride) env.KNORVIA_CORE_03_ENTRY = entryOverride;
  else delete env.KNORVIA_CORE_03_ENTRY;
  const args = [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "--test-timeout=120000",
    ...listTests(),
  ];
  let output = "";
  try {
    output = execFileSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8", env });
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const pass = Number((output.match(/^ℹ pass (\d+)$/mu) ?? [])[1] ?? 0);
  const fail = Number((output.match(/^ℹ fail (\d+)$/mu) ?? [])[1] ?? 0);
  return { pass, fail, total: pass + fail };
}

function backupPath(rel) {
  return join(backupDir, rel.replace(/[\\/]/gu, "__"));
}

function applyStubs() {
  mkdirSync(backupDir, { recursive: true });
  for (const rel of targetFiles) {
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) throw new Error(`target missing: ${rel}`);
    copyFileSync(abs, backupPath(rel));
    writeFileSync(abs, `// SPDX-License-Identifier: Apache-2.0\n// stub\n${stubNotice}`);
  }
}

function restoreStubs() {
  for (const rel of targetFiles) {
    const backup = backupPath(rel);
    if (existsSync(backup)) copyFileSync(backup, resolve(repoRoot, rel));
  }
  rmSync(backupDir, { force: true, recursive: true });
}

const result = {
  commit: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  source: null,
  dist: null,
  stubReplacement: null,
  stubTargets: targetFiles.length,
};

result.source = runTests(null);
result.dist = runTests(resolve(coreRoot, "dist/index.js"));

try {
  applyStubs();
  result.stubReplacement = runTests(null);
} finally {
  restoreStubs();
}

writeFileSync(resolve(testsDir, "..", "gate-old.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
