// SPDX-License-Identifier: Apache-2.0
// 浏览器打开的形状声明：由 browser.ts 原样再导出，公开面不变。
// 字段说明（调用方按这些字段读取结果/构造选项，字段名是契约）：
// command：实际使用的命令名（open / cmd.exe / xdg-open），失败时也返回，便于排障。
// opened：命令是否成功启动；打开网页本身失败不在本模块判定范围内。
// reason：失败原因文本，仅 opened=false 时出现。
// platform：覆盖运行平台，测试用；缺省取 process.platform。
// spawnProcess：子进程注入点，测试与桌面宿主用它接管启动行为。
// timeoutMs：判定「已启动」的等待上限，防止某些平台上 spawn 事件迟迟不到。

import type { spawn } from "node:child_process";

export interface BrowserOpenResult {
  command: string;
  opened: boolean;
  reason?: string;
}

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}
