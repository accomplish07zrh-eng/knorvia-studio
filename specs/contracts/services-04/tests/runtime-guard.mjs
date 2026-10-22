// SPDX-License-Identifier: Apache-2.0
// 运行期守卫：加载模块并抽取其源码导出面。
import { extractExports } from "./exports-ast.mjs";
import { importModule, moduleFilePath, repoRoot } from "./entry.mjs";

/**
 * 加载模块并抽取其源码导出。
 *
 * @returns `{ loaded, exports }`：`loaded` 是运行期模块对象，`exports` 是源码 AST 导出面。
 * @throws 若模块无法加载（桩会在导入阶段抛错）。
 */
export async function loadDeclaredExports(row) {
  const loaded = await importModule(row);
  return { loaded, exports: extractExports(repoRoot, row.name) };
}

/** 只验证可加载性。 */
export async function assertLoadable(row) {
  return importModule(row);
}

export { moduleFilePath, repoRoot };
