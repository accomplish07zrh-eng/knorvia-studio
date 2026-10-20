// SPDX-License-Identifier: Apache-2.0
// 本模块自身的模块地址：源码/独立 dist 用 import.meta.url，
// esbuild 的 CJS 单文件把 import.meta 替换成空对象，只能从 __filename 取。

import { pathToFileURL } from "node:url";

declare const __filename: string | undefined;

/**
 * 解析「当前模块」的可解析地址。bundler 把源码打进单文件时 `import.meta.url`
 * 不存在，此时回落到 CJS 的 `__filename`。
 *
 * @returns `file:` 地址。
 */
function resolveSelfModuleUrl(): string {
  if (typeof __filename === "string") return pathToFileURL(__filename).href;
  return import.meta.url;
}

/**
 * 裸包名解析基准：让 DSH Loader 的 entry `name` 从依赖树里解析。
 *
 * @returns `file:` 地址。
 */
export function resolveDefaultModuleBaseUrl(): string {
  return resolveSelfModuleUrl();
}
