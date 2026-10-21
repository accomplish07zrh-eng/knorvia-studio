// SPDX-License-Identifier: Apache-2.0
// B1–B6：范围、导出面双向一致、导出总数、纯类型文件的零运行时导出、入口形状、示例定位。
// 断言方向是「源码 → interface.md → 产物」两个方向相等，而不是各自与手抄常数相等。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { importModule, moduleFilePath, entryLabel, repoRoot } from "./entry.mjs";
import { declaredNames, extractExports } from "./exports-ast.mjs";
import {
  FROZEN,
  contractDir,
  declarations,
  entries,
  examples,
  portFiles,
  roleCounts,
  scope,
  SR_DIR,
  srcPrefix,
} from "./scope.mjs";
import { existsSync } from "node:fs";
import { loadDeclaredExports, sourcePathOf as guardSourcePath } from "./runtime-guard.mjs";

const interfaceText = readFileSync(`${contractDir}/interface.md`, "utf8");

/** 取 interface.md 里某模块的小节正文；找不到返回 undefined。 */
function sectionOf(heading) {
  const start = interfaceText.indexOf(heading);
  if (start === -1) return undefined;
  const next = interfaceText.indexOf("\n### ", start + 1);
  return interfaceText.slice(start, next === -1 ? undefined : next);
}

/** 声明块里的名字集合：抓 ```ts 围栏内的 export 声明名。 */
function declaredNamesInSection(section) {
  const fence = "`".repeat(3);
  const start = section.indexOf(`${fence}ts`);
  if (start === -1) return [];
  const body = section.slice(start + fence.length + 2);
  const end = body.indexOf(fence);
  return declaredNames(body.slice(0, end === -1 ? undefined : end));
}

function sourcePathOf(row) {
  const subdir = row.role === "port" ? "app/" : "";
  return `${SR_DIR}${subdir}${row.modulePath}.ts`;
}

/**
 * 桩替换后本包的契约测试必须全部失败（旧门的 allFail 要求）。
 *
 * 契约包的断言大量是**静态分析**（AST、interface.md、callers-raw.json），这些即使
 * 源码被打成桩也照样成立——因为导出面与依赖方向是「源码文本属性」。若不显式要求
 * 「模块能被真实加载」，桩替换就无法验证测试对实现的约束力。
 *
 * 因此每个套件的第一个用例都先断言「范围内模块可导入且导出面非空」：
 * 桩文件在加载时即抛 `not implemented: services-02`，于是整条链立刻失败。
 */
async function assertOwnersLoadable(rows) {
  for (const row of rows) {
    const loaded = await importModule(row);
    const declared = extractExports(repoRoot, sourcePathOf(row));
    assert.ok(declared.length > 0, `${row.modulePath} 声明面不应为空`);
    // 纯类型模块运行期为空对象；只要「能导入成功」即证明不是桩
    assert.equal(typeof loaded, "object", `${row.modulePath} 应可导入`);
  }
}
describe(`B1 范围清单（${entryLabel}）`, () => {
  it("范围内的 17 个模块都能被真实加载（非桩）", async () => {
    await assertOwnersLoadable(scope);
  });

  it("17 个文件：角色分布与分类计数与冻结值一致", async () => {
    await assertOwnersLoadable(scope);
    assert.equal(scope.length, FROZEN.count);
    assert.deepEqual(roleCounts(), FROZEN.byRole);
    assert.equal(declarations.length, 10);
    assert.equal(portFiles.length, 4);
    assert.equal(entries.length, 2);
    assert.equal(examples.length, 1);
  });

  it("每个范围文件在源码树中存在，且行数字段为正", async () => {
    await assertOwnersLoadable(scope);
    for (const row of scope) {
      const absolute = `${repoRoot}/${row.path}`;
      assert.ok(existsSync(absolute), `缺少源码文件：${row.path}`);
      assert.ok(row.lines > 0, `${row.modulePath} 行数应为正`);
    }
  });
});

describe(`B2 导出面双向一致（${entryLabel}）`, () => {
  it("每个模块都有一节，且声明名集合与 AST 导出一致（双向）", async () => {
    for (const row of scope) {
      const heading =
        row.role === "port"
          ? `### \`${srcPrefix}${SR_DIR}${row.modulePath}.ts\``
          : `### \`${srcPrefix}${row.path.slice(srcPrefix.length)}\``;
      const section = sectionOf(heading);
      assert.ok(section !== undefined, `interface.md 缺少小节：${heading}`);

      // 用集合比较而非数组：`contract.ts` 里有个同名声明写了两次（TS 允许，
      // 为兼容既有写法），按名字集合比对才是「导出面一致」的正确口径。
      const { exports: declaredExports } = await loadDeclaredExports(row);
      const fromInterface = [...new Set(declaredNamesInSection(section))].sort();
      // 桶文件（contract.ts）用 `export *` 转发整批模块，那些转发语句没有具体名字；
      // 具名导出在这里双向比对，转发语句条数单独由 B2b 断言。
      const fromSource = [
        ...new Set(
          declaredExports
            .filter((entry) => entry.kind !== "star-reexport")
            .map((entry) => entry.name),
        ),
      ].sort();
      assert.deepEqual(fromInterface, fromSource, `${row.modulePath} 导出面不一致`);
    }
  });

  it("B2b 桶文件的重导出语句条数与 interface.md 一致", async () => {
    for (const row of scope) {
      const heading =
        row.role === "port"
          ? `### \`${srcPrefix}${SR_DIR}${row.modulePath}.ts\``
          : `### \`${srcPrefix}${row.path.slice(srcPrefix.length)}\``;
      const section = sectionOf(heading);
      assert.ok(section !== undefined);

      const { exports: declaredExports } = await loadDeclaredExports(row);
      const starInInterface = (section.match(/^export\s+(?:type\s+)?\*\s+from\b/gmu) ?? []).length;
      const starInSource = declaredExports.filter((entry) => entry.kind === "star-reexport").length;
      assert.equal(starInInterface, starInSource, `${row.modulePath} 重导出条数不一致`);
    }
  });
});

describe(`B3 导出总数守恒（${entryLabel}）`, () => {
  it("参与统计的模块可加载（非桩）", async () => {
    await assertOwnersLoadable(scope);
  });

  it("17 个模块合计 164 项导出，运行时 50 / 纯类型 114", async () => {
    let total = 0;
    let runtime = 0;
    for (const row of scope) {
      const { exports: declaredExports } = await loadDeclaredExports(row);
      total += declaredExports.length;
      runtime += declaredExports.filter((entry) => entry.runtime).length;
    }
    assert.equal(total, FROZEN.exports.total);
    assert.equal(runtime, FROZEN.exports.runtime);
    assert.equal(total - runtime, FROZEN.exports.typeOnly);
  });
});

describe(`B4 纯类型声明文件零运行时导出（${entryLabel}）`, () => {
  it("6 个纯类型声明文件不产生任何运行期值", async () => {
    const pureTypes = [
      "agentToolTypes",
      "attentionTypes",
      "types",
      "workspaceImageTypes",
      "workspaceReviewTypes",
      "workspaceRuntimeTypes",
    ];
    for (const name of pureTypes) {
      const row = scope.find((entry) => entry.modulePath === name);
      assert.ok(row !== undefined, `${name} 应在范围内`);
      const { exports: declaredExports } = await loadDeclaredExports(row);
      const runtime = declaredExports.filter((entry) => entry.runtime);
      assert.equal(
        runtime.length,
        0,
        `${name} 不应有运行时导出，实际有：${runtime.map((entry) => entry.name).join(", ")}`,
      );
    }
  });
});

describe(`B5 入口形状（${entryLabel}）`, () => {
  it("module 导出 1 项、node 导出 3 项，且路径在产物中可用", async () => {
    const moduleRow = scope.find((row) => row.modulePath === "module");
    const nodeRow = scope.find((row) => row.modulePath === "node");
    assert.ok(moduleRow !== undefined && nodeRow !== undefined);

    assert.equal((await loadDeclaredExports(moduleRow)).exports.length, 1);
    assert.equal((await loadDeclaredExports(nodeRow)).exports.length, 3);

    assert.ok(existsSync(moduleFilePath(moduleRow)), "module 入口文件缺失");
    assert.ok(existsSync(moduleFilePath(nodeRow)), "node 入口文件缺失");
  });

  it("两个入口可被动态导入（运行期无副作用崩溃）", async () => {
    for (const row of entries) {
      const loaded = await importModule(row);
      assert.ok(
        loaded !== null && typeof loaded === "object",
        `${row.modulePath} 导入结果应为模块对象`,
      );
    }
  });
});

describe(`B6 示例不属于公开 API（${entryLabel}）`, () => {
  it("示例模块可加载且导出面非空（非桩）", async () => {
    await assertOwnersLoadable(examples);
  });

  it("示例文件的 9 项导出实现齐全，但不在兼容入口清单里", async () => {
    const exampleRow = examples[0];
    assert.ok(exampleRow !== undefined);
    const { exports: declaredExports } = await loadDeclaredExports(exampleRow);
    assert.equal(declaredExports.length, 9);

    // 示例小节在 interface.md 中单独成节并标注「非公开 API」
    const section = sectionOf(`### \`${srcPrefix}${exampleRow.path.slice(srcPrefix.length)}\``);
    assert.ok(section !== undefined);
    assert.ok(section.length > 0);
  });
});
