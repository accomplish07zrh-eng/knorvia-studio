// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 契约测试：模块路径兼容面与导出声明覆盖。
//
// - interface.md 列出的范围文件在源码侧（以及 dist 入口模式下的产物侧）必须存在；
// - interface.md 各节的 ```ts 导出声明块覆盖 53 个重写目标的源码导出。
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

/** 与 core-tool-01 B88 同一条导出声明正则。两侧各用一次，避免 /g 的 lastIndex 串扰。 */
function exportNames(text) {
  return new Set(
    [
      ...text.matchAll(
        /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z0-9_$]+)/gm,
      ),
    ].map((match) => match[1]),
  );
}

test("B20 interface.md 导出声明块覆盖 53 个重写目标的源码导出", () => {
  const interfaceText = readFileSync(join(contractDir, "interface.md"), "utf8");
  const prefix = "apps/cli/packages/dynamic-workflow/src/";
  const declared = [];
  const missing = [];
  for (const match of interfaceText.matchAll(/^### `([^`]+)`$/gm)) {
    const full = match[1];
    if (!full.startsWith(prefix)) continue;
    const file = full.slice(prefix.length);
    if (UNREVIEWED.has(file)) continue;
    const heading = `### \`${full}\``;
    const sectionStart = interfaceText.indexOf(heading);
    const sectionEnd = interfaceText.indexOf("\n### ", sectionStart + 1);
    const section = interfaceText.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);
    if (!section.includes("```ts")) continue;
    declared.push(file);
    const blockText = [...section.matchAll(/```ts\r?\n([\s\S]*?)```/g)]
      .map((block) => block[1])
      .join("\n");
    const source = readFileSync(join(srcRoot, file), "utf8");
    const names = exportNames(source);
    // v2（计划书 M1 复盘第 4 条，core-tool-01 B88）：oracle 从 stubs/<路径> 改指本节 ```ts 导出声明块。
    // 断言方向与强度逐字不变：源码导出名 ⊆ 合同声明，缺任何一个仍由 assert.deepEqual(missing, []) 拦下。
    const contractNames = exportNames(blockText);
    for (const name of names) if (!contractNames.has(name)) missing.push(`${file}:${name}`);
  }
  const relative = declared.sort();
  const rewriteTargets = scopeFiles().filter((file) => !UNREVIEWED.has(file));
  assert.equal(rewriteTargets.length, 53, "重写目标必须是 53 个（55 - 2 unreviewed）");
  assert.deepEqual(relative, rewriteTargets, "桩文件集与重写目标集必须一致");
  assert.deepEqual(missing, []);
});
