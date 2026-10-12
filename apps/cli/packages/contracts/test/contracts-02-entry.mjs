// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-02 契约测试的公开入口解析：测试住在包自己的 test/ 目录，随 `pnpm test:studio` 一起跑。
// - 默认 source：本包 src（需要 --import tsx）
// - KNORVIA_CONTRACTS_ENTRY=dist：本包 dist（先跑 pnpm build:cli-packages 或本包 build）
// 契约测试只经这些公开入口做黑盒断言，不 import 任何内部实现文件。
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const entryMode = process.env.KNORVIA_CONTRACTS_ENTRY === "dist" ? "dist" : "source";

// test/ 的上一级就是包根，src 与 dist 都从这里展开。
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/** 载入包的公开入口：load() 是 "."，load("tools") 是 "./tools"。 */
export async function load(subpath = "") {
  const base = join(packageRoot, entryMode === "dist" ? "dist" : "src");
  const file = subpath ? join(base, subpath, "index") : join(base, "index");
  return import(pathToFileURL(`${file}${entryMode === "dist" ? ".js" : ".ts"}`).href);
}

/** 载入包内单文件公开入口（用于没有 index.ts 的导出子路径）。 */
export async function loadFile(relativePath) {
  const base = join(packageRoot, entryMode === "dist" ? "dist" : "src");
  const extension = entryMode === "dist" ? ".js" : ".ts";
  return import(pathToFileURL(join(base, `${relativePath}${extension}`)).href);
}
