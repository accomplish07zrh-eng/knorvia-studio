// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 形状声明的公开入口：具体定义在 workspace-hook-trust-shapes.ts，本文件只做再导出。
// 这样「调用方依赖的类型名」保持稳定，而形状可以独立演进与单独评审。

export type {
  FileWorkspaceHookTrustStoreOptions,
  WorkspaceHookTrustStoreCompactOptions,
  WorkspaceHookTrustStoreLoadResult,
  WorkspaceHookTrustStorePathOptions,
  WorkspaceHookTrustStoreRevokeOptions,
} from "./workspace-hook-trust-shapes.js";

// 使用约定：
// 约定一：装载结果三态只由 status 区分，调用方不要用 records.length 反推状态。
// 约定二：损坏态一定带 recoveredCorruptPath，便于上层提示或归档问题文件。
// 约定三：需要替换时钟、rename 或进程探测时，用 FileWorkspaceHookTrustStoreOptions 的注入点，
//         不要在调用方做时间或文件系统的特判。
// 约定四：Compact 的保留集合与上限同时生效；Revoke 不传摘要即整工作区撤销。
// 约定五：Path 选项只改「信任文件在哪」，不改文件名与目录结构。
// 维护一：新增形状时先在这里登记再改调用方，避免深层 import 到 shapes 文件。
// 维护二：删除形状前先确认包外引用（dep:refs --list-exports 可查）。
