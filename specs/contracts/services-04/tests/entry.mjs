// SPDX-License-Identifier: Apache-2.0
// services-04 合同入口解析：默认源码入口，KNORVIA_SVC04_ENTRY=dist 切到构建产物。
//
// 与 services-02/03 的差异：本包的模块分散在 `packages/services/src` 的多个目录，
// 不是单一下沉目录，所以路径直接从 scope 记录的 `name`（相对 `packages/services/src`）解析。
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const pkgRoot = resolve(repoRoot, "packages/services");
export const mode = (process.env.KNORVIA_SVC04_ENTRY ?? "source").trim();
export const isDist = mode === "dist";
export const entryLabel = mode;

const SRC_PREFIX = "packages/services/src/";

function toSourceRelative(name) {
  return name.replace(/\.ts$/u, ".js");
}

function absPath(name) {
  const rel = toSourceRelative(name);
  return resolve(pkgRoot, isDist ? "dist" : "src", rel);
}

/** 按 scope 记录的 `name`（相对 `packages/services/src`）动态导入模块。 */
export async function importModule(row) {
  return import(pathToFileURL(absPath(row.name)).href);
}

/** 模块的绝对文件路径（surface 测试核对存在性）。 */
export function moduleFilePath(row) {
  return absPath(row.name);
}

/** 包级聚合桶的绝对路径（`index.ts` / `node.ts`）。仅 source 模式可导入。 */
export function barrelPath(which) {
  const name = which === "node" ? "node.js" : "index.js";
  return resolve(pkgRoot, isDist ? "dist" : "src", name);
}

/** 导入聚合桶（用于 K-z 的「转发面完整性断言」）。 */
export async function importBarrel(which) {
  return import(pathToFileURL(barrelPath(which)).href);
}

export { SRC_PREFIX };
