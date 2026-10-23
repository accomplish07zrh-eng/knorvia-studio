// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 存储根目录与项目标识的纯路径计算。
//
// 背景（2026-10-23，kernel-switch 前置）：
// 这些函数原先和 `getProjectMemoryRoot` 一起放在 `app/paths.ts`。
// 而 `getProjectMemoryRoot` 依赖 `@knorvia/core` 的 `resolveProjectMemoryRoot`，
// 导致整个文件带上了 core 依赖。
//
// 而 `plugins.ts:62` 只用到这里的 `getCliStorageRoot` / `getPluginStorageRoot`，
// 它经由 `kernel-bridge/legacy/domain-handlers.ts` 在**新引擎路径上**
// （`kernel/process.ts` 动态 import `kernel-bridge/entry.js`）。
// 新引擎路径必须零 `@knorvia/core` 依赖，所以把这两个纯函数拆出来，
// 让 `plugins.ts` 不再触碰带 core 依赖的 `app/paths.ts`。
//
// 本模块只做纯路径拼接：不读文件、不读环境、无副作用。

import { basename, join } from "node:path";
import { createProjectId, type ProjectId } from "@knorvia/contracts";

/** CLI 的存储根：若传入的目录本身叫 `cli` 就用它，否则在其下建 `cli/`。 */
export function getCliStorageRoot(storageRoot: string): string {
  return basename(storageRoot) === "cli" ? storageRoot : join(storageRoot, "cli");
}

/** 插件目录位于 CLI 存储根下的 `plugins/`。 */
export function getPluginStorageRoot(cliStorageRoot: string): string {
  return join(cliStorageRoot, "plugins");
}

/** 模型 I/O 落盘目录：开发态用 `debug/`，发布态用 `rollout/`。 */
export function getModelIoDir(cliStorageRoot: string, isDevelopment: boolean): string {
  return join(cliStorageRoot, isDevelopment ? "debug" : "rollout");
}

/** 由目录路径推导稳定的项目标识（小写化、非标识符字符转 `-`、截断 80 字符）。 */
export function projectIdFromDirectory(directory: string): ProjectId {
  return createProjectId(
    directory
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "default",
  );
}
