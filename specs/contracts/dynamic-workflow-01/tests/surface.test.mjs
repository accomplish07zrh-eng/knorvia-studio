// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 契约测试：模块路径兼容面与桩一致性。
//
// - interface.md 列出的范围文件在源码侧（以及 dist 入口模式下的产物侧）必须存在；
// - stubs/ 下的桩文件与 interface.md 的文件清单一一对应，且只含签名与抛错体。
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { entryLabel, repoRoot } from "./entry.mjs";

const srcRoot = join(repoRoot, "apps/cli/packages/dynamic-workflow/src");
const contractDir = resolve(repoRoot, "specs/contracts/dynamic-workflow-01");

/** 范围 = analysis 全部 .ts + compiler/compile.ts（55 个）。 */
function scopeFiles() {
  const analysis = readdirSync(join(srcRoot, "analysis"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `analysis/${name}`);
  return [...analysis, "compiler/compile.ts"].sort();
}

/** 重写目标 = 范围文件减去 2 个 unreviewed（不重写不删）。 */
const UNREVIEWED = new Set(["analysis/operators.ts", "analysis/placeholder-resolution.ts"]);

test(`B18 模块路径兼容面：55 个范围文件存在（${entryLabel}）`, () => {
  const files = scopeFiles();
  assert.equal(files.length, 55, "范围必须是 55 个文件（53 重写 + 2 unreviewed）");
  for (const file of files) {
    assert.ok(existsSync(join(srcRoot, file)), `源码缺少 ${file}`);
  }
});

test(`B19 dist 入口模式下 55 个产物存在（${entryLabel}）`, () => {
  if (entryLabel !== "dist") return; // 只在 dist 入口下校验产物
  const distRoot = join(repoRoot, "apps/cli/packages/dynamic-workflow/dist");
  for (const file of scopeFiles()) {
    const js = join(distRoot, file.replace(/\.ts$/, ".js"));
    assert.ok(existsSync(js), `dist 缺少 ${js}`);
    assert.ok(existsSync(join(distRoot, file.replace(/\.ts$/, ".d.ts"))), `dist 缺少声明 ${file}`);
  }
});

test("B20 桩面：stubs/ 与 53 个重写目标一一对应且只含签名", () => {
  const stubRoot = join(contractDir, "stubs");
  const stubFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) stubFiles.push(full);
    }
  };
  walk(stubRoot);
  const relative = stubFiles
    .map((file) =>
      file
        .split("\\")
        .join("/")
        .replace(/^.*\/stubs\/apps\/cli\/packages\/dynamic-workflow\/src\//, ""),
    )
    .sort();
  const rewriteTargets = scopeFiles().filter((file) => !UNREVIEWED.has(file));
  assert.equal(rewriteTargets.length, 53, "重写目标必须是 53 个（55 - 2 unreviewed）");
  assert.deepEqual(relative, rewriteTargets, "桩文件集与重写目标集必须一致");
  for (const file of stubFiles) {
    const text = readFileSync(file, "utf8");
    assert.ok(
      text.includes('throw new Error("not implemented: dynamic-workflow-01")'),
      `${file} 桩必须抛 not implemented`,
    );
    assert.ok(text.startsWith("// SPDX-License-Identifier: Apache-2.0"), `${file} 缺 SPDX 头`);
  }
  const targets = readFileSync(join(stubRoot, "targets.txt"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  assert.equal(targets.length, 53, "targets.txt 必须列 53 个目标");
});
