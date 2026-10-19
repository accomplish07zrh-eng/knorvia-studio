// SPDX-License-Identifier: Apache-2.0
// shared-04 合同入口解析：默认源码入口，KNORVIA_SHARED_04_ENTRY=dist 切到构建产物入口。
// 用法：node --import tsx --test specs/contracts/shared-04/tests/*.test.mjs
//       KNORVIA_SHARED_04_ENTRY=dist node --import tsx --test specs/contracts/shared-04/tests/*.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const mode = (process.env.KNORVIA_SHARED_04_ENTRY ?? "source").trim();
const sharedRoot = resolve(repoRoot, "packages/shared");

const entryFile = (relSource, relDist) =>
  mode === "dist" ? resolve(sharedRoot, relDist) : resolve(sharedRoot, relSource);

/** `@knorvia/shared` 根 barrel（源码或 dist）。 */
export const barrel = await import(pathToFileURL(entryFile("src/index.ts", "dist/index.js")).href);

/**
 * 按模块相对路径加载单个模块（源码或 dist 两侧）。
 * 用于「模块路径兼容面」与逐模块导出面断言。
 */
export async function loadModule(relativePath) {
  const rel = relativePath.replace(/\.ts$/u, "");
  return import(pathToFileURL(entryFile(`src/${rel}.ts`, `dist/${rel}.js`)).href);
}

export const entryLabel = mode;
