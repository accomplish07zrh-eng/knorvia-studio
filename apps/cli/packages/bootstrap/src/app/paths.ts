// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 项目记忆根目录的计算（依赖 `@knorvia/core` 的 `resolveProjectMemoryRoot`）。
//
// 2026-10-23 kernel-switch 前置：本文件原先把「纯路径函数」与「依赖 core 的记忆根函数」
// 混在一起，导致 `plugins.ts`（经由 `kernel-bridge/legacy/domain-handlers.ts` 在新引擎
// 路径上）间接带上了 core 依赖。
//
// 现在纯路径函数已拆到 `./storage-paths.ts`（新引擎路径只用那些），
// 本文件只保留依赖 core 的那一个函数 —— 它只被 legacy 路径使用
// （`protocol/server-operations.ts`），随 core 一起删除。
//
// 下面的再导出是为了不打断既有的 `app/paths.js` 引用方，等 legacy 路径整体删除时一并去掉。

import { resolveProjectMemoryRoot } from "@knorvia/core";

export {
  getCliStorageRoot,
  getModelIoDir,
  getPluginStorageRoot,
  projectIdFromDirectory,
} from "./storage-paths.js";

/** 项目记忆根目录：按 workspace 隔离，落在 CLI 存储根下。 */
export function getProjectMemoryRoot(
  cliStorageRoot: string,
  workingDirectory: string,
  workspaceIdentity?: string,
): string {
  return resolveProjectMemoryRoot({
    cliStorageRoot,
    workspaceIdentity,
    workspacePath: workingDirectory,
  });
}
