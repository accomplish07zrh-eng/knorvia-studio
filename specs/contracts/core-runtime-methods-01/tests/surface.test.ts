// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：接口面（模块路径 × 导出名 × 运行时绑定）。
// interface.md 的机器生成导出清单是唯一事实源；本包无桶入口，改验 21 个模块路径均可导入、
// 49 个导出逐名可取，且源码 / dist 两入口在同一套断言下一致。桩替换时必须全部失败。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contractDir, entryLabel, methods, methodsDir, repoRoot } from "./entry.mjs";

type InterfaceRow = {
  kind: string;
  module: string;
  name: string;
  runtime: boolean;
};

/** 解析 interface.md「模块路径 × 导出名」四列表；签名段在表后的代码块里，不参与解析。 */
function parseInterfaceRows(): InterfaceRow[] {
  const text = readFileSync(join(contractDir, "interface.md"), "utf8");
  const rows: InterfaceRow[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\w+)\s*\|\s*(是|否)\s*\|$/u.exec(line);
    if (!match) continue;
    rows.push({
      kind: match[3],
      module: match[1],
      name: match[2],
      runtime: match[4] === "是",
    });
  }
  return rows;
}

const rows = parseInterfaceRows();
const byModule = new Map<string, InterfaceRow[]>();
for (const row of rows) {
  const bucket = byModule.get(row.module) ?? [];
  bucket.push(row);
  byModule.set(row.module, bucket);
}

const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8")) as {
  files: { classification: string; path: string }[];
};

const loadModule = (module: string) => methods(module.replace(/\.ts$/u, ""));

test("interface.md × 运行时导出：21 模块 / 49 导出逐名一致", async () => {
  assert.equal(rows.length, 49, "导出合计 49");
  assert.equal(byModule.size, 21, "模块数 21");
  assert.equal(rows.filter((row) => row.runtime).length, 48, "运行时值导出 48 个");
  assert.equal(rows.filter((row) => !row.runtime).length, 1, "纯类型导出 1 个（ToolUsagePayload）");
  for (const module of byModule.keys()) {
    assert.ok(!module.includes("/../"), `interface.md 的模块路径必须是包内相对路径：${module}`);
  }

  assert.equal(scope.files.length, 21, "范围清单 21 个继承文件");
  const counts: Record<string, number> = {};
  for (const file of scope.files) {
    counts[file.classification] = (counts[file.classification] ?? 0) + 1;
    assert.ok(existsSync(join(repoRoot, file.path)), `继承模块缺失：${file.path}`);
    assert.ok(
      file.path.startsWith("apps/cli/packages/core/src/runtime/methods/"),
      `继承文件必须落在 methods 目录：${file.path}`,
    );
  }
  assert.deepEqual(
    counts,
    { unreviewed: 6, "upstream-modified": 12, "upstream-unchanged": 3 },
    "继承分类分布是契约",
  );
  assert.ok(existsSync(methodsDir), `methods 入口目录缺失：${methodsDir}`);

  if (entryLabel === "dist") {
    for (const file of scope.files) {
      const artifact = join(
        repoRoot,
        "apps/cli/packages/core/dist/runtime/methods",
        file.path.slice(file.path.lastIndexOf("/") + 1).replace(/\.ts$/u, ".js"),
      );
      assert.ok(existsSync(artifact), `dist 入口产物缺失：${artifact}`);
    }
  }

  for (const [module, moduleRows] of byModule) {
    const expected = moduleRows
      .filter((row) => row.runtime)
      .map((row) => row.name)
      .sort();
    const namespace = (await loadModule(module)) as Record<string, unknown>;
    const actual = Object.keys(namespace).sort();
    assert.deepEqual(
      actual,
      expected,
      `${module} 的运行时导出必须与 interface.md 一致（entry=${entryLabel}）`,
    );
    for (const name of expected) {
      assert.notEqual(
        namespace[name],
        undefined,
        `${module}#${name} 必须是可取到的运行时绑定（entry=${entryLabel}）`,
      );
    }
  }
  assert.equal(scope.files.length, byModule.size, "范围清单与接口清单模块数一致");
});

test("21 个模块路径均可按公开路径导入，且入口取值受控", async () => {
  assert.ok(
    entryLabel === "source" || entryLabel === "dist",
    `入口环境变量取值必须是 source 或 dist：${entryLabel}`,
  );

  // 无桶入口：methods/index.ts 不在范围，兼容面就是 21 条模块路径本身。
  for (const module of byModule.keys()) {
    const namespace = (await loadModule(module)) as Record<string, unknown>;
    const runtimeRows = (byModule.get(module) ?? []).filter((row) => row.runtime);
    assert.ok(runtimeRows.length > 0, `${module} 应至少有一个运行时导出`);
    for (const row of runtimeRows) {
      assert.equal(
        typeof namespace[row.name],
        row.kind === "const" ? "string" : "function",
        `${module}#${row.name}（${row.kind}）在 entry=${entryLabel} 下的运行时形态`,
      );
    }
  }

  // 范围清单的 21 个文件与接口表的 21 个模块逐一对应（同一集合，两种表达）。
  const scopeModules = scope.files
    .map((file) => file.path.slice(file.path.lastIndexOf("/") + 1))
    .sort();
  assert.deepEqual(scopeModules, [...byModule.keys()].sort(), "范围清单与接口表模块集合一致");
});
