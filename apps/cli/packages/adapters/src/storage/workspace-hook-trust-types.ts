// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// Workspace Hook Trust 的形状声明（本文件不含运行时代码，实现文件只按名字 import 这里的名字）。
//
// 三组形状，各自对应一个阶段：
//   - **装载**：三态判别联合，非 ok 时 records 恒为空数组（调用方不必再判空）；
//             损坏态一定带 recoveredCorruptPath，便于上层提示或归档问题文件。
//   - **写入**：文件存储选项 = 必填路径 + 四组可注入点（时钟 / 锁调参 / 文件系统动作 / 进程探测）；
//             压缩、撤销、定位是三类独立操作，各自只取它需要的字段。
//   - **维护**：新增形状先在此登记再改调用方；删除形状前先确认包外引用（`dep:refs --list-exports`）。
//
// 竞态与过期：`beforeRename` 在 rename 之前执行，用来验证「锁仍在时不得提交」的边界；
// `renameRetryDelaysMs` 给出重试节奏，`lockTimeoutMs` 与 `staleLockMs` 决定过期判定。
//
// 本文件不导出运行时代码，新增字段不会改变包的运行行为；
// 实现文件（store / file / lock / process）只按名字 import，不复制形状定义。

import type { FileHandle, rename } from "node:fs/promises";
import type { WorkspaceHookTrustRecord } from "@knorvia/contracts";

/** 装载态一：文件不存在，记录为空。 */
type TrustStoreMissing = { status: "missing"; records: [] };

/** 装载态二：正常读到记录。 */
type TrustStoreOk = { status: "ok"; records: WorkspaceHookTrustRecord[] };

/** 装载态三：文件损坏，附带一份保留下来的副本路径。 */
type TrustStoreCorrupt = { status: "corrupt"; records: []; recoveredCorruptPath: string };

/** 装载结果：三态判别联合（判别键是 status）。 */
export type WorkspaceHookTrustStoreLoadResult =
  | TrustStoreMissing
  | TrustStoreOk
  | TrustStoreCorrupt;

/** 时钟注入：默认取 Date.now，测试可替换。 */
type ClockInjection = { now?: () => number };

/** 锁的过期与重试参数。 */
type LockTuning = {
  lockTimeoutMs?: number;
  staleLockMs?: number;
  renameRetryDelaysMs?: readonly number[];
};

/** 可在测试里替换的文件系统动作。 */
type FileSystemInjection = {
  beforeRename?: () => void | Promise<void>;
  renameFile?: typeof rename;
  writeLockOwnerMetadata?: (handle: FileHandle, content: string) => Promise<void>;
};

/** 进程启动时间探测：判定锁持有者是否还活着。 */
type ProcessProbe = { probeProcessStartTime?: (pid: number) => Promise<number | null> };

/** 文件存储选项：必填路径 + 四组可注入点。 */
export type FileWorkspaceHookTrustStoreOptions = { filePath: string } & ClockInjection &
  LockTuning &
  FileSystemInjection &
  ProcessProbe;

/** 压缩时要保留的一条「工作区 + 声明摘要」。 */
type CompactRetentionEntry = { workspaceIdentity: string; hookDeclarationDigest: string };

/** 压缩选项：保留集合 + 两个上限 + 可选当前时刻。 */
export type WorkspaceHookTrustStoreCompactOptions = {
  current: CompactRetentionEntry[];
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
};

/** 撤销选项：省略摘要即整工作区撤销。 */
export type WorkspaceHookTrustStoreRevokeOptions = {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
};

/** 位置选项：只改「信任文件在哪」，不改文件名与目录结构。 */
export type WorkspaceHookTrustStorePathOptions = { homeDir?: string; userConfigPath?: string };
