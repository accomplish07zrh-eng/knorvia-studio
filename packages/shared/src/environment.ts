// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 运行环境信息探测。
//
// 背景（2026-10-23，kernel-switch 前置的符号移出）：
// 这个函数原先在 `core/src/environment.ts`，而它的消费者是 `@knorvia/cli` 的入口
// （`run.ts`）。core 会随 kernel-switch 删除，所以移到这里。
//
// 放在 `@knorvia/shared` 而非 `@knorvia/shared-types`：后者是纯类型包，
// 而这里要读 `process` 与 `node:sea`，是真实的运行期依赖。
//
// **唯一的副作用是读取进程自身的事实**（arch / cwd / execPath / version / platform），
// 不发起任何 I/O 请求。

import { isSea } from "node:sea";
import type { RuntimeInfo } from "@knorvia/shared-types";

export type { RuntimeInfo };

/**
 * 收集当前运行环境的快照。
 *
 * `sea` 表示「是否运行在 Node 单文件可执行包（SEA）里」——
 * 打包后的 CLI 与直接 `node` 启动的行为差异需要它来区分。
 */
export const getRuntimeInfo = (): RuntimeInfo => ({
  arch: process.arch,
  cwd: process.cwd(),
  execPath: process.execPath,
  node: process.version,
  platform: process.platform,
  sea: isSea(),
  versions: process.versions,
});
