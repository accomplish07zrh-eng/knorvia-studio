// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins 的公开入口解析。
//
// 与 kernel-dsh-00 同一条规则：默认 dist，`KNORVIA_KERNEL_ENTRY=source` 走源码
// （需 `--import tsx`）。只解析公开子路径产物，不 import 内部实现文件。
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRootPath } from "./entry.mjs";

const entryMode = process.env.KNORVIA_KERNEL_ENTRY === "source" ? "source" : "dist";
const extension = entryMode === "dist" ? ".js" : ".ts";

/** 内核公开入口所在的目录。 */
const kernelRoot = join(
  repoRootPath,
  "apps/cli/packages/bootstrap",
  entryMode === "dist" ? "dist/kernel" : "src/kernel",
);

/**
 * 加载 `@knorvia/bootstrap/kernel` 子路径的公开导出。
 *
 * @returns 该子路径的模块命名空间。
 */
export async function loadKernel() {
  return import(pathToFileURL(join(kernelRoot, `index${extension}`)).href);
}
