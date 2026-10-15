// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 合同入口解析：默认源码入口，KNORVIA_ADAPTERS_ENTRY=dist 时切到构建产物。
//
// 用法（仓库根目录）：
//   node --import tsx --test specs/contracts/apps-cli-packages-01-model/tests/*.test.ts
//   KNORVIA_ADAPTERS_ENTRY=dist node --import tsx --test specs/contracts/apps-cli-packages-01-model/tests/*.test.ts
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const entryLabel = process.env.KNORVIA_ADAPTERS_ENTRY?.trim() === "dist" ? "dist" : "source";
export const adaptersRoot = resolve(
  repoRoot,
  `apps/cli/packages/adapters/${entryLabel === "dist" ? "dist" : "src"}`,
);

const extension = entryLabel === "dist" ? ".js" : ".ts";

/** 载入本包的一个模块路径（相对 adapters 的 src/dist 根，如 "model/errors"）。 */
export async function load(modulePath) {
  return await import(pathToFileURL(resolve(adaptersRoot, `${modulePath}${extension}`)).href);
}

/** 载入某个模块的绝对路径形式（用于断言“同名不同来源”的同一性）。 */
export async function loadAbsolute(absolutePath) {
  return await import(pathToFileURL(absolutePath).href);
}

/** 合同 fixtures 目录。 */
export const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
