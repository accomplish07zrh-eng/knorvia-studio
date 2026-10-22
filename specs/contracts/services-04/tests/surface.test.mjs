// SPDX-License-Identifier: Apache-2.0
// B1–B2 + B6 + K-z：范围清单、分组、导出面、**转发面完整性**。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { contractDir, frozen, PLAN_DIRS, scopeRows, srcPrefix } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";
import { importBarrel, isDist, repoRoot } from "./entry.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const interfaceText = readFileSync(join(contractDir, "interface.md"), "utf8");
const callersSummary = JSON.parse(readFileSync(join(contractDir, "callers-summary.json"), "utf8"));
const stats = frozen();

/** interface.md 里每个模块块的导出名（oracle）。 */
function declaredExportsOf(moduleName) {
  const marker = `### \`${srcPrefix}${moduleName}\``;
  const start = interfaceText.indexOf(marker);
  if (start < 0) return undefined;
  const next = interfaceText.indexOf("\n### ", start + marker.length);
  const block = interfaceText.slice(start, next < 0 ? interfaceText.length : next);
  const fence = "```";
  const open = block.indexOf(`${fence}ts`);
  if (open < 0) return [];
  const body = block.slice(open + fence.length + 2, block.lastIndexOf(fence));
  const names = [];

  // ① declaration 形式：export [type] [async] function*/const/class/interface/type/enum NAME
  // ⚠️ 必须支持 `function*`（生成器函数）—— services-04 有 3 个文件用它
  for (const match of body.matchAll(
    /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|const|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gmu,
  )) {
    names.push(match[1]);
  }
  for (const match of body.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s+/gmu)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (piece === "") continue;
      const alias = /\bas\s+([A-Za-z0-9_$]+)$/u.exec(piece);
      names.push(alias ? alias[1] : piece);
    }
  }
  for (const _ of body.matchAll(/^export\s+\*\s+from\s+/gmu)) names.push("*");
  return names;
}

/** 从聚合桶源码里抽取「转发的符号名」（`export { A, B } from "..."`）。 */
function barrelForwardedNames(file) {
  const source = readFileSync(join(repoRoot, file), "utf8");
  const names = new Set();
  for (const match of source.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s+/gmu)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (piece === "") continue;
      const alias = /\bas\s+([A-Za-z0-9_$]+)$/u.exec(piece);
      names.add(alias ? alias[1] : piece);
    }
  }
  return names;
}

describe(`surface（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B0 全部 46 个实现文件必须可加载（运行期守卫前置）", async () => {
    await ensureLoadable();
  });

  test("B1 范围：46 文件，分组与冻结值一致", async () => {
    await ensureLoadable();
    const rows = scopeRows();
    assert.equal(rows.length, stats.count, `文件数应为 ${stats.count}`);
    assert.equal(stats.count, 46);

    const byGroup = {};
    for (const row of rows) {
      byGroup[row.group] ??= { files: 0, lines: 0, exports: 0 };
      byGroup[row.group].files += 1;
      byGroup[row.group].lines += row.lines;
      byGroup[row.group].exports += row.exportCount;
    }
    assert.deepEqual(byGroup, stats.byGroup, "分组统计应与冻结值一致");

    // 计划书 L215 的 7 项里，types/ 实际无 .ts 实现（只有 yazl.d.ts）
    const presentGroups = new Set(rows.map((r) => r.group));
    for (const dir of PLAN_DIRS) {
      if (dir === "types") {
        assert(!presentGroups.has(dir), "types/ 应无 .ts 实现文件（只有第三方 .d.ts）");
      } else {
        assert(presentGroups.has(dir === "." ? "." : dir), `组 ${dir} 应有实现文件`);
      }
    }
  });

  test("B1 范围：行数/字节/分类与冻结值一致", async () => {
    await ensureLoadable();
    const rows = scopeRows();
    const lines = rows.reduce((sum, r) => sum + r.lines, 0);
    const bytes = rows.reduce((sum, r) => sum + r.bytes, 0);
    const exports = rows.reduce((sum, r) => sum + r.exportCount, 0);
    const runtime = rows.reduce((sum, r) => sum + r.runtimeExports, 0);

    assert.equal(lines, stats.lines, `行数应为 ${stats.lines}`);
    assert.equal(bytes, stats.bytes, `字节数应为 ${stats.bytes}`);
    assert.equal(exports, stats.exports, `导出数应为 ${stats.exports}`);
    assert.equal(runtime, stats.runtimeExports, `运行时导出应为 ${stats.runtimeExports}`);

    const byClass = {};
    for (const row of rows) byClass[row.classification] = (byClass[row.classification] ?? 0) + 1;
    assert.deepEqual(byClass, stats.byClassification);
  });

  test("B2 分组：interface.md 覆盖 46 个模块，无遗漏无重复", async () => {
    await ensureLoadable();
    const moduleHeaders = [
      ...interfaceText.matchAll(/^### `packages\/services\/src\/([^`]+)\.ts`$/gmu),
    ].map((m) => `${m[1]}.ts`);
    assert.equal(moduleHeaders.length, 46, `interface.md 应恰好列出 46 个模块`);
    assert.equal(new Set(moduleHeaders).size, 46, "模块不得重复");
    assert.deepEqual(
      moduleHeaders.slice().sort(),
      scopeRows()
        .map((r) => r.name)
        .sort(),
      "interface.md 的模块集应与 scope 完全一致",
    );
  });

  test("B3 导出总数守恒：每个模块与 interface.md 逐条一致", async () => {
    await ensureLoadable();
    let total = 0;
    for (const row of scopeRows()) {
      const actual = extractExports(repoRoot, row.name).map((e) => e.name);
      const declared = declaredExportsOf(row.name);
      assert(declared !== undefined, `${row.name} 未出现在 interface.md`);
      assert.deepEqual(
        actual.slice().sort(),
        declared.slice().sort(),
        `${row.name} 的导出面与 interface.md 不一致`,
      );
      total += actual.length;
      assert.equal(row.exportCount, actual.length, `${row.name} 的 scope 记录导出数应等于实测`);
    }
    assert.equal(total, 145, `46 个模块合计应为 145 项导出，实际 ${total}`);
  });

  test("B6 + K-z 转发面完整性：聚合桶的每条转发都能在运行期取到", async () => {
    await ensureLoadable();
    // ⚠️ 设计说明（这一条我最初写错过两次，见 known-differences.md K-z）：
    //
    // 错误设计 ①：「模块若被外部直接引用 → 它的全部导出都必须被聚合桶转发」
    //   → 实测 22 个「孤立符号」，但它们不是漏项：外部可以只引用模块的部分符号，
    //     其余是内部细节，不需转发。
    //
    // 错误设计 ②：「静态解析聚合桶的转发语句，逐条比对目标模块的 AST 导出名」
    //   → 实测 5–7 条「悬空」，但它们也不是漏项：
    //     目标模块可能 `export *` 或「先 import 再 re-export」，
    //     静态解析一层看不穿（`agent.ts` 的 `KnorviaAgentWorkspaceTarget` 就是这样）。
    //
    // 正确设计（运行期验证）：「聚合桶加载后，转发的每个符号都必须真的存在」
    //   → 这直接等价于「聚合桶不会因转发失效而缺符号」，
    //   而且完全绕开了静态解析的多级转发问题。
    const expectations = [
      { barrel: "index", file: "packages/services/src/index.ts" },
      { barrel: "node", file: "packages/services/src/node.ts" },
    ];

    let totalChecked = 0;
    const missing = [];

    for (const { barrel, file } of expectations) {
      const loaded = await importBarrel(barrel);
      const source = readFileSync(join(repoRoot, file), "utf8");

      for (const stmt of source.matchAll(
        /^export\s+(type\s+)?\{([\s\S]*?)\}\s*from\s*"([^"]+)"/gmu,
      )) {
        const isTypeOnly = stmt[1] !== undefined;
        if (isTypeOnly) continue; // 纯类型转发在运行期不存在，无法用 loaded 校验

        const names = stmt[2]
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "" && !p.startsWith("//") && !p.startsWith("type "))
          .map(
            (p) =>
              (/\bas\s+([A-Za-z0-9_$]+)$/u.exec(p) ?? [null, p.split(/\s+as\s+/u)[0].trim()])[1],
          );

        for (const name of names) {
          if (name === "") continue;
          totalChecked += 1;
          if (!(name in loaded)) missing.push(`${barrel}.ts#${name}`);
        }
      }
    }

    assert(totalChecked > 100, `应校验 >100 个运行期转发符号，实际 ${totalChecked}`);
    assert.deepEqual(
      missing,
      [],
      `以下转发符号在聚合桶加载后取不到（公开面缺符号）：\n${missing.join("\n")}`,
    );
  });

  test("K-z 聚合桶可加载：index.ts 与 node.ts 都能真实 import", async () => {
    for (const which of ["index", "node"]) {
      const loaded = await importBarrel(which);
      assert.equal(typeof loaded, "object", `${which}.ts 应可加载`);
      assert(
        Object.keys(loaded).length > 20,
        `${which}.ts 应有大量运行期导出（实际 ${Object.keys(loaded).length}）`,
      );
    }
  });

  test("K-y 第三方类型垫片：types/yazl.d.ts 登记但不属实现范围", async () => {
    await ensureLoadable();
    const rows = scopeRows();
    assert(
      rows.every((r) => !r.name.endsWith(".d.ts")),
      "实现范围不得包含 .d.ts",
    );
    // 该文件存在（第三方类型声明）
    assert.doesNotThrow(() =>
      readFileSync(join(repoRoot, "packages/services/src/types/yazl.d.ts")),
    );
  });
});
