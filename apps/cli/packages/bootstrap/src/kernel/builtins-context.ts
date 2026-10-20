// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 运行环境上下文在组合里的行定义。插件体在 ./runtime-context.ts；
// 这里只描述「组合里那一行长什么样」，地址由 builtins-modules.ts 算好传进来。

import type { KernelPluginRow } from "./composition.js";

/** 行 id；与 DSH 内建行不重名。 */
const KERNEL_RUNTIME_CONTEXT_ID = "runtime-context";

/**
 * 构造运行环境上下文行。
 *
 * @param moduleUrl - 插件模块的可解析 `file:` 地址。
 * @returns 该组合行。
 */
export function createRuntimeContextRow(moduleUrl: string): KernelPluginRow {
  return { id: KERNEL_RUNTIME_CONTEXT_ID, name: moduleUrl };
}
