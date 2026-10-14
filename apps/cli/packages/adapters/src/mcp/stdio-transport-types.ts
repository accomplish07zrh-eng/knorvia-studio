// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// 进程树 stdio 传输的内部形状（非公开导出，仅供实现模块之间共享）。
// StdioProcessExitInfo：首次退出信息（exitCode/signal 与两个时间戳），被 client-lifecycle 读取。
// ProcessTreeStdioClientTransportOptions：可注入的 job object 工厂，测试与桌面宿主使用。

import type { WindowsJobObjectController } from "./windows-job-object.js";

export interface StdioProcessExitInfo {
  exitCode: number | null;
  exitedAt: number;
  signal: NodeJS.Signals | null;
  startedAt: number;
}

export interface ProcessTreeStdioClientTransportOptions {
  windowsJobObjectFactory?: (pid: number) => Promise<WindowsJobObjectController | undefined>;
}
