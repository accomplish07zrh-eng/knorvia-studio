// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// core-02 契约测试的入口解析：
// - 默认 source：apps/cli/packages/core/src（需要 --import tsx）
// - KNORVIA_CORE_ENTRY=dist：apps/cli/packages/core/dist（先 pnpm --dir apps/cli/packages/core build）
// 只经**区域桶与模块入口**加载：core 的包根入口在 tsx 源码模式下不可加载
// （src/index.ts:21 把类型 ToolExecutor 当值再导出），这一点记在 known-differences.md。
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const entryMode = process.env.KNORVIA_CORE_ENTRY === "dist" ? "dist" : "source";

const packageRoot = fileURLToPath(new URL("../../../../apps/cli/packages/core/", import.meta.url));

/** 载入 core 的一个模块（相对包内 src/dist 的路径，不带扩展名）。 */
export async function loadModule(relativePath) {
  const base = join(packageRoot, entryMode === "dist" ? "dist" : "src");
  const extension = entryMode === "dist" ? ".js" : ".ts";
  return import(pathToFileURL(join(base, `${relativePath}${extension}`)).href);
}

/** 区域桶：只有这三个区域有 index；memory 没有桶，按模块逐个加载。 */
export const areaBarrels = {
  permission: "permission/index",
  pluginReference: "plugin-reference/index",
  runtimeTask: "runtime-task/index",
  memoryRecall: "memory/recall/index",
};

export async function loadArea(name) {
  const relative = areaBarrels[name];
  if (!relative) throw new Error(`unknown core-02 area barrel: ${name}`);
  return loadModule(relative);
}
