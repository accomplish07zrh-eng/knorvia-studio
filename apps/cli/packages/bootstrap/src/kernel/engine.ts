// SPDX-License-Identifier: Apache-2.0
// 引擎选择的唯一纯函数入口；本文件不得 import 任何 DSH 模块，保证默认路径零加载。

export type KernelEngine = "legacy" | "dsh";

export const KERNEL_ENGINE_ENV = "KNORVIA_KERNEL_ENGINE";
export const KERNEL_ENGINE_DSH = "dsh";

export function resolveKernelEngine(
  env: Readonly<Record<string, string | undefined>>,
): KernelEngine {
  return env[KERNEL_ENGINE_ENV]?.trim() === KERNEL_ENGINE_DSH ? "dsh" : "legacy";
}
