// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-00 契约测试的公开入口解析：
// - 默认 dist：apps/cli/packages/bootstrap/dist/kernel（先构建对应包）
// - KNORVIA_KERNEL_ENTRY=source：apps/cli/packages/bootstrap/src/kernel（需要 --import tsx）
// 测试只通过公开子路径做黑盒断言，不 import 任何内部实现文件。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entryMode = process.env.KNORVIA_KERNEL_ENTRY === "source" ? "source" : "dist";
const extension = entryMode === "dist" ? ".js" : ".ts";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const kernelRoot = join(
  repoRoot,
  "apps/cli/packages/bootstrap",
  entryMode === "dist" ? "dist/kernel" : "src/kernel",
);

export { entryMode, repoRoot };
export const cliEntry = join(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");

export async function loadKernel() {
  return import(pathToFileURL(join(kernelRoot, `index${extension}`)).href);
}

export async function loadKernelEngine() {
  return import(pathToFileURL(join(kernelRoot, `engine${extension}`)).href);
}
