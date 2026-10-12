// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-01 契约测试的公开入口解析：
// - 默认 source：apps/cli/packages/contracts/src（需要 --import tsx）
// - KNORVIA_CONTRACTS_ENTRY=dist：apps/cli/packages/contracts/dist（先跑 pnpm build:cli-packages）
// 契约测试只通过这些公开入口做黑盒断言，不 import 任何内部实现文件。
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const entryMode = process.env.KNORVIA_CONTRACTS_ENTRY === "dist" ? "dist" : "source";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/** 载入包的公开入口：load() 是 "."，load("events") 是 "./events"。 */
export async function load(subpath = "") {
  const base = join(packageRoot, entryMode === "dist" ? "dist" : "src");
  const file = subpath ? join(base, subpath, "index") : join(base, "index");
  return import(pathToFileURL(`${file}${entryMode === "dist" ? ".js" : ".ts"}`).href);
}

/** 载入包内单文件公开入口（用于没有 index.ts 的导出子路径，例如 interfaces/shared.ts）。 */
/** 当前入口模式下包根的绝对路径与扩展名，供类型级测试拼 tsconfig。 */
export const entryFacts = {
  mode: entryMode,
  packageRoot,
  base: join(packageRoot, entryMode === "dist" ? "dist" : "src"),
  extension: entryMode === "dist" ? ".js" : ".ts",
};

export async function loadFile(relativePath) {
  const base = join(packageRoot, entryMode === "dist" ? "dist" : "src");
  const extension = entryMode === "dist" ? ".js" : ".ts";
  return import(pathToFileURL(join(base, `${relativePath}${extension}`)).href);
}
