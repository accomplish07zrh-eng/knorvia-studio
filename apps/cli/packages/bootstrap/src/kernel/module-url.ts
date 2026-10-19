// SPDX-License-Identifier: Apache-2.0
// 裸包名解析基准：源码/独立 dist 用 import.meta.url，esbuild 的 CJS 单文件用 __filename。

import { pathToFileURL } from "node:url";

declare const __filename: string | undefined;

export function resolveDefaultModuleBaseUrl(): string {
  if (typeof __filename === "string") return pathToFileURL(__filename).href;
  return import.meta.url;
}
