// SPDX-License-Identifier: Apache-2.0
// 运行期守卫：每条静态断言前先证明模块能真实加载。
//
// 背景（见 known-differences.md K1 与 services-02 的同名教训）：
// 桩替换（build-stubs.mjs）只把模块顶层改成 `throw`，并按 AST 声明导出名。
// 于是「源码文本层面的导出名」与真实实现完全一致 ——
// 纯静态断言（AST 扫描 / interface.md 比对）在桩下照样成立，
// 旧门的 `allFail` 防线对契约包完全失效。
//
// 这个守卫让静态断言变成「先证明模块能真实加载，再比对文本」：
//   · 真实实现 → 导入成功 → 文本比对继续 → 通过；
//   · 桩       → 导入即抛 → 断言失败 → allFail 成立。
import { extractExports } from "./exports-ast.mjs";
import { importModule, moduleFilePath, repoRoot } from "./entry.mjs";
import { sourcePathOf } from "./scope.mjs";

/**
 * 加载模块并抽取其源码导出。
 *
 * @returns `{ loaded, exports }`：`loaded` 是运行期模块对象，`exports` 是源码 AST 导出面。
 * @throws 若模块无法加载（桩会在这里抛 `not implemented`）。
 */
export async function loadDeclaredExports(row) {
  const loaded = await importModule(row);
  return { loaded, exports: extractExports(repoRoot, sourcePathOf(row)) };
}

/** 只验证可加载性（用于不关心导出面的用例）。 */
export async function assertLoadable(row) {
  const loaded = await importModule(row);
  return loaded;
}

export { moduleFilePath, repoRoot };
