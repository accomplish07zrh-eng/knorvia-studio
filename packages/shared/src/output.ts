// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 输出整形与终端能力探测。
//
// 背景（2026-10-23，kernel-switch 前置的符号移出）：
// 这些函数原先在 `core/src/output.ts`，而它们的消费者全部是 `@knorvia/cli`
// （8 个命令文件 + 入口 `run.ts`）。core 会随 kernel-switch 删除，若把这些函数
// 留在 core，cli 会在那时编译失败。
//
// 而它们**不能**放进 `@knorvia/shared-types` —— 那是纯类型包
// （「只有编译期事实，模块求值后运行期命名空间为空」），
// 放运行期函数会破坏它的不变量。
//
// 所以放在这里：`@knorvia/shared` 是「共享协议与类型」包，已允许运行期导出，
// 且 core 与 cli 都已是它的依赖（平级消费，无反向依赖）。
//
// **本模块只有纯函数与无状态常量**：除读取 `stream.isTTY` 外不触碰外部世界。

import type { JsonValue } from "@knorvia/shared-types";

export type { JsonValue };

/** 把值序列化成缩进 2 空格、末尾带换行的 JSON 文本。 */
export const formatJson = (value: JsonValue): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * 判断某个输出流是否该上色。
 *
 * `noColor` 是显式关闭（来自 CLI 参数或 `NO_COLOR` 环境变量），优先级高于 TTY 探测：
 * 用户明确要求无色时，即使是终端也不能上色。
 */
export const supportsColor = (stream: NodeJS.WriteStream, noColor: boolean): boolean => {
  if (noColor) {
    return false;
  }

  return Boolean(stream.isTTY);
};

/**
 * ANSI 转义片段。每个方法都接收 `enabled` 并在关闭时原样返回文本 ——
 * 这样调用点不必自己判断，也不会在重定向输出里混入转义序列。
 */
export const color = {
  bold: (text: string, enabled: boolean) => (enabled ? `\x1b[1m${text}\x1b[22m` : text),
  cyan: (text: string, enabled: boolean) => (enabled ? `\x1b[36m${text}\x1b[39m` : text),
  dim: (text: string, enabled: boolean) => (enabled ? `\x1b[2m${text}\x1b[22m` : text),
  green: (text: string, enabled: boolean) => (enabled ? `\x1b[32m${text}\x1b[39m` : text),
  red: (text: string, enabled: boolean) => (enabled ? `\x1b[31m${text}\x1b[39m` : text),
};
