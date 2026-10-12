// SPDX-License-Identifier: Apache-2.0
// contract-gate 的端到端自测：在系统临时目录里造一个最小合同（一个必然通过的测试文件 + 一个桩），
// 跑工具并检查它记录的源码入口结果与桩替换结论。夹具放在临时目录，不污染 specs/contracts（那会被
// test:studio 按目录收集）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "contract-gate-selftest-"));
  const contractDir = join(root, "selftest");
  mkdirSync(join(contractDir, "tests"), { recursive: true });
  writeFileSync(
    join(contractDir, "tests", "smoke.test.ts"),
    [
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'import { answer } from "../../target.js";', // 必须真的引用目标模块，桩替换后才会有测试失败
      "",
      'test("smoke", () => {',
      "  assert.equal(answer, 42);",
      "});",
      "",
    ].join("\n"),
  );
  // 目标模块 + 桩：桩替换后测试必须全失败（这里用「桩抛错」模拟）。
  const target = join(root, "target.ts");
  writeFileSync(target, "export const answer = 42;\n");
  mkdirSync(join(contractDir, "stubs"), { recursive: true });
  writeFileSync(
    join(contractDir, "stubs", "target.ts"),
    'export const answer = (() => {\n  throw new Error("not implemented: selftest");\n})();\n',
  );
  const targets = join(root, "targets.txt");
  writeFileSync(targets, `${resolve(target)}\n`);
  return { root, contractDir, target, targets };
}

test("contract-gate 记录源码入口结果并验证桩替换全失败", () => {
  const { root, contractDir, targets } = fixture();
  const jsonPath = join(root, "gate-old.json");
  try {
    const output = execFileSync(
      process.execPath,
      [
        join(repoRoot, "scripts/contract-gate.mjs"),
        "--contract",
        contractDir,
        "--json",
        jsonPath,
        "--stub-root",
        join(contractDir, "stubs"),
        "--stub-targets",
        targets,
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(report.entries.source.tests, 1);
    assert.equal(report.entries.source.pass, 1);
    assert.equal(report.entries.source.exitCode, 0);
    assert.equal(report.entries.dist.distSkipped, true);
    assert.equal(report.stubReplacement.replacedFiles, 1);
    assert.equal(report.stubReplacement.pass, 0, "桩替换后不应有测试通过");
    assert.equal(report.stubReplacement.allFail, true);
    assert.equal(report.pass, true);
    assert.match(output, /报告写入/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract-gate 缺 --contract 时以用法错误退出（2）", () => {
  let status = 0;
  try {
    execFileSync(process.execPath, [join(repoRoot, "scripts/contract-gate.mjs")], {
      cwd: repoRoot,
      stdio: "ignore",
    });
  } catch (error) {
    status = error.status;
  }
  assert.equal(status, 2);
});
