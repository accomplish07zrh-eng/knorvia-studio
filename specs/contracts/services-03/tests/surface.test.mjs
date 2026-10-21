// SPDX-License-Identifier: Apache-2.0
// B1–B3 + B11–B13：范围清单、功能簇分组、导出面完整性。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { contractDir, FROZEN, scope, sourcePathOf } from "./scope.mjs";
import { extractExports } from "./exports-ast.mjs";
import { importModule, isDist, repoRoot } from "./entry.mjs";
import { assertLoadable, loadDeclaredExports } from "./runtime-guard.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const interfaceText = readFileSync(join(contractDir, "interface.md"), "utf8");

/** interface.md 里每个模块块的导出名（oracle）。 */
function declaredExportsOf(modulePath) {
  const marker = `### \`packages/services/src/studio-runtime/domain/${modulePath}.ts\``;
  const start = interfaceText.indexOf(marker);
  if (start < 0) return undefined;
  const next = interfaceText.indexOf("\n### ", start + marker.length);
  const block = interfaceText.slice(start, next < 0 ? interfaceText.length : next);
  const fence = "```";
  const open = block.indexOf(`${fence}ts`);
  if (open < 0) return [];
  const body = block.slice(open + fence.length + 2, block.lastIndexOf(fence));
  const names = [];

  // ① declaration 形式（可跨行，但名字总在同一行）：export [type] const|function|...
  for (const match of body.matchAll(
    /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gmu,
  )) {
    names.push(match[1]);
  }

  // ② re-export 形式（可能跨行）：export [type] { A, B as C } from "..."
  for (const match of body.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s+/gmu)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (piece === "") continue;
      const alias = /\bas\s+([A-Za-z0-9_$]+)$/u.exec(piece);
      names.push(alias ? alias[1] : piece);
    }
  }

  // ③ star re-export：export * from "..."
  for (const _ of body.matchAll(/^export\s+\*\s+from\s+/gmu)) names.push("*");

  return names;
}

describe(`surface（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B0 全部 31 个模块必须可加载（运行期守卫前置）", async () => {
    await ensureLoadable();
    // 关键：契约包的断言大量是静态分析（读 JSON / 读 interface.md / AST 扫源码），
    // 而桩替换只把模块顶层改成 throw、按 AST 声明导出名 ——
    // 于是纯静态断言在桩下照样成立，旧门的 allFail 防线会失效。
    // 这条用例给所有静态断言一个「运行期前置」：模块加载不了就直接失败。
    const failures = [];
    for (const row of scope) {
      try {
        await assertLoadable(row);
      } catch (error) {
        failures.push(`${row.modulePath}: ${error.message.split("\n")[0]}`);
      }
    }
    assert.deepEqual(failures, [], `以下模块无法加载：\n${failures.join("\n")}`);
  });

  test("B1 范围：31 文件，分类计数与冻结值一致", async () => {
    await ensureLoadable();
    assert.equal(scope.length, FROZEN.count, `文件数应为 ${FROZEN.count}`);
    assert.equal(FROZEN.count, 31);

    const counts = {};
    for (const row of scope) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
    assert.deepEqual(counts, FROZEN.byClassification);
    assert.deepEqual(counts, { original: 17, unreviewed: 14 });
  });

  test("B1 范围：行数/字节总量与冻结值一致", async () => {
    await ensureLoadable();
    const lines = scope.reduce((sum, row) => sum + row.lines, 0);
    const bytes = scope.reduce((sum, row) => sum + row.bytes, 0);
    assert.equal(lines, FROZEN.lines, `行数应为 ${FROZEN.lines}`);
    assert.equal(bytes, FROZEN.bytes, `字节数应为 ${FROZEN.bytes}`);
  });

  test("B2 功能簇：8 个簇覆盖全部 31 文件，无遗漏无重复", async () => {
    await ensureLoadable();
    const headers = [...interfaceText.matchAll(/^## (.+)$/gmu)].map((match) => match[1]);
    const clusters = headers.filter((title) => title !== "本包的定位" && title !== "不在兼容面上");
    assert.equal(clusters.length, 8, `应有 8 个功能簇，实际 ${clusters.length}`);

    const moduleHeaders = [
      ...interfaceText.matchAll(
        /^### `packages\/services\/src\/studio-runtime\/domain\/([A-Za-z0-9_$]+)\.ts`$/gmu,
      ),
    ].map((match) => match[1]);
    assert.equal(moduleHeaders.length, 31, "interface.md 应恰好列出 31 个模块");
    assert.equal(new Set(moduleHeaders).size, 31, "模块不得重复");
    assert.deepEqual(
      moduleHeaders.slice().sort(),
      scope.map((row) => row.modulePath.replace(/^domain\//u, "")).sort(),
      "interface.md 的模块集应与 scope 完全一致",
    );
  });

  test("B3 导出总数守恒：每个模块与 interface.md 一致", async () => {
    await ensureLoadable();
    let total = 0;
    for (const row of scope) {
      const name = row.modulePath.replace(/^domain\//u, "");
      const actual = extractExports(repoRoot, sourcePathOf(row)).map((entry) => entry.name);
      const declared = declaredExportsOf(name);
      assert(declared !== undefined, `${name} 未出现在 interface.md`);
      assert.deepEqual(
        actual.sort(),
        declared.slice().sort(),
        `${name} 的导出面与 interface.md 不一致`,
      );
      total += actual.length;
      assert.equal(row.exportCount, actual.length, `${name} 的 scope 记录导出数应等于实测`);
    }
    assert.equal(total, 192, `31 个模块合计应为 192 项导出，实际 ${total}`);
  });

  test("B11–B13 端口 3 模块：导出面完整且可加载", async () => {
    await ensureLoadable();
    for (const name of ["imageInput", "outputRef", "reference"]) {
      const row = scope.find((item) => item.modulePath === `domain/${name}`);
      assert(row !== undefined, `${name} 应在 scope 内`);
      const declared = declaredExportsOf(name);
      assert(declared.length > 0, `${name} 应有导出`);

      const { loaded, exports } = await loadDeclaredExports(row);
      assert.equal(typeof loaded, "object", `${name} 应可加载`);
      assert.deepEqual(
        exports.map((entry) => entry.name).sort(),
        declared.slice().sort(),
        `${name} 的源码导出应与 interface.md 一致`,
      );
      for (const entry of exports.filter((item) => item.runtime)) {
        assert.ok(entry.name in loaded, `${name} 的运行时导出 ${entry.name} 应可用`);
      }
    }
  });
});
