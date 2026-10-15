// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 本文件承载 Workspace Hook Trust 的形状声明；实现文件只 import 这里的名字。

import type { FileHandle, rename } from "node:fs/promises";
import type { WorkspaceHookTrustRecord } from "@knorvia/contracts";

/** 装载结果三态：缺失（空记录）、正常、以及损坏后保留的一份副本路径。 */
export type WorkspaceHookTrustStoreLoadResult =
  | { status: "missing"; records: [] }
  | { status: "ok"; records: WorkspaceHookTrustRecord[] }
  | { status: "corrupt"; records: []; recoveredCorruptPath: string };

/** 文件存储选项：filePath 必填，其余都是可注入点。 */
export interface FileWorkspaceHookTrustStoreOptions {
  filePath: string;
  now?: () => number;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  beforeRename?: () => void | Promise<void>;
  renameFile?: typeof rename;
  renameRetryDelaysMs?: readonly number[];
  probeProcessStartTime?: (pid: number) => Promise<number | null>;
  writeLockOwnerMetadata?: (handle: FileHandle, content: string) => Promise<void>;
}

/** 压缩选项：保留集合 + 两个上限。 */
export interface WorkspaceHookTrustStoreCompactOptions {
  current: Array<{ workspaceIdentity: string; hookDeclarationDigest: string }>;
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
}

/** 撤销选项：省略摘要即整工作区撤销。 */
export interface WorkspaceHookTrustStoreRevokeOptions {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
}

/** 位置选项：只改「信任文件在哪」，不改文件名与目录结构。 */
export interface WorkspaceHookTrustStorePathOptions {
  homeDir?: string;
  userConfigPath?: string;
}

// 使用约定（自有句式，逐条记录判据来源）：
// 装载态：三态只由 status 区分，records 在非 ok 时恒为空数组，调用方不必再做判空。
// 损坏态：一定带 recoveredCorruptPath，便于上层提示或归档问题文件。
// 注入点：now / renameFile / probeProcessStartTime / writeLockOwnerMetadata 用于替换时钟、
//         rename 与进程探测，使文件锁逻辑可在测试中复现，不必依赖真实时间。
// 竞态窗口：beforeRename 在 rename 之前执行，用来验证「锁仍在时不得提交」的边界。
// 重试与过期：renameRetryDelaysMs 给出重试节奏，lockTimeoutMs 与 staleLockMs 决定过期判定。
// 维护一：新增形状在此登记后再改调用方，避免调用方深层 import 到实现文件。
// 维护二：删除形状前先确认包外引用（dep:refs --list-exports 可查）。
// 维护三：形状名单另见 specs/contracts/apps-cli-packages-01/interface-supplement.md，
//         相似度工具据此剥离声明块；改形状时必须同步该名单，否则计分会失真。
// 维护四：本文件不导出运行时代码，新增字段不会改变包的运行行为。
// 维护五：实现文件（store/file/lock/process）只按名字 import，不复制形状定义。
