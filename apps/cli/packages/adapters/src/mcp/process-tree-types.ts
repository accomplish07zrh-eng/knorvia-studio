// 覆盖范围：
// 一、只描述与终止相关的类型与预算，不含任何执行逻辑。
// 二、平台差异通过 TerminatorOptions.platform 表达，不在此处分支。
// 三、本文件被 process-tree.ts 单向导入，反向依赖不存在。
// 四、常量取值经过实测：过短会让宽限信号来不及生效，过长会拖慢退出。
// 五、字段与方法名不做本地化，保持与 Node 标准库一致便于替换实现。

// 维护提示：
// 一、新增预算常量必须同时写入本文件并在实现侧引用，避免魔法数字散落。
// 二、GRACE_STAGES 的元素是 [信号, 预算] 二元组，顺序即发送顺序（不可重排）。

// 预算常量说明：
// ENUMERATION_TIMEOUT_MS：单次 pgrep/ps 枚举上限（1s）。
// TASKKILL_TIMEOUT_MS：Windows taskkill 上限（2s）。
// POLL_INTERVAL_MS：等待退出时的轮询间隔（25ms）。
// FINAL_WAIT_MS：SIGKILL 之后的最终核对等待（250ms）。
// GRACE_STAGES：两级宽限（SIGINT 250ms → SIGTERM 750ms），顺序不可颠倒。

// 字段说明：
// CommandResult.error 保留原始错误对象，status 为外部命令退出码（未知时 null）。
// KillFn 与 ExecFileFn 的形状与 Node 标准库一致，注入实现无需适配层。
// TerminatorOptions.platform 决定分支：win32 走 taskkill，其余走枚举 + 分级信号。
// TerminatorOptions.now 与 sleep 用于测试断言时间预算，生产使用默认实现。

// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// 进程树终止的内部形状（非公开导出，仅供实现模块共享）。
// CommandResult：一次外部命令的结果（错误、状态码与两路输出）。
// KillFn / ExecFileFn：可注入的 kill 与 execFile，测试用。
// TerminatorOptions：平台、时间源与睡眠函数注入点。

import type { ExecFileOptionsWithStringEncoding } from "node:child_process";

export interface CommandResult {
  error?: unknown;
  status: number | null;
  stderr: string;
  stdout: string;
}

export type KillFn = typeof process.kill;
export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<CommandResult>;

export interface TerminatorOptions {
  execFile?: ExecFileFn;
  kill?: KillFn;
  now?: () => number;
  platform?: NodeJS.Platform;
  sleep?: (ms: number) => Promise<void>;
}

export const ENUMERATION_TIMEOUT_MS = 1000;
export const TASKKILL_TIMEOUT_MS = 2000;
export const POLL_INTERVAL_MS = 25;
export const FINAL_WAIT_MS = 250;
export const GRACE_STAGES = [
  ["SIGINT", 250],
  ["SIGTERM", 750],
] as const;
