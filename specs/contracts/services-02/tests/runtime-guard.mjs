// SPDX-License-Identifier: Apache-2.0
// 契约包测试的「运行期守卫」：把静态断言的 oracle 从「源码文本」改成「真实模块」。
//
// 为什么必须这样：契约包的断言大量是静态分析（AST、interface.md、callers-raw.json）。
// 这些读的是**源码文本**，而桩替换只把模块顶层改成 `throw`，文本层面的导出名仍在——
// 于是静态断言在桩下照样通过，旧门的 allFail 验证就失效了。
//
// 解法：每个静态断言前先 `await loadDeclaredExports(row)`：
//   · 桩文件在 import 时立即抛 `not implemented: services-02` → 断言失败 ✓
//   · 真实模块导入后，用「运行期导出面」作为 AST 比对的一侧，等价性不变。
import assert from "node:assert/strict";

import { importModule } from "./entry.mjs";
import { extractExports } from "./exports-ast.mjs";
import { repoRoot } from "./entry.mjs";
import { SR_DIR } from "./scope.mjs";

/** 源码里记的模块路径（端口基线下位于 app/ 内）。 */
export function sourcePathOf(row) {
  const subdir = row.role === "port" ? "app/" : "";
  return `${SR_DIR}${subdir}${row.modulePath}.ts`;
}

/**
 * 导入模块并返回它的 AST 导出列表（含类型导出，供与 interface.md 比对）。
 *
 * 先导入再抽取：导入会触发桩的顶层 throw，使断言在桩下必然失败。
 */
export async function loadDeclaredExports(row) {
  const loaded = await importModule(row);
  assert.equal(typeof loaded, "object", `${row.modulePath} 应能作为模块导入`);
  return {
    loaded,
    exports: extractExports(repoRoot, sourcePathOf(row)),
  };
}

/** 仅需要「确认模块可真实加载」时使用。 */
export async function assertLoadable(rows) {
  for (const row of rows) {
    await loadDeclaredExports(row);
  }
}
