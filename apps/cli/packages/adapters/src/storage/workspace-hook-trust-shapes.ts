// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { FileHandle, rename } from "node:fs/promises";
import type { WorkspaceHookTrustRecord } from "@knorvia/contracts";

/** 装载结果三态：缺失（空记录）、正常、以及损坏后保留的一份副本路径。 */
export type WorkspaceHookTrustStoreLoadResult =
  | { status: "missing"; records: [] }
  | { status: "ok"; records: WorkspaceHookTrustRecord[] }
  | { status: "corrupt"; records: []; recoveredCorruptPath: string };

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

export interface WorkspaceHookTrustStoreCompactOptions {
  current: Array<{ workspaceIdentity: string; hookDeclarationDigest: string }>;
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
}

export interface WorkspaceHookTrustStoreRevokeOptions {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
}

export interface WorkspaceHookTrustStorePathOptions {
  homeDir?: string;
  userConfigPath?: string;
}

// 形状说明：
// 命名一：LoadResult 用 status 区分三态，records 在非 ok 时恒为空数组，调用方无需再做判空。
// 命名二：FileWorkspaceHookTrustStoreOptions.filePath 是唯一必填项，其余都是可注入点。
// 注入一：now / renameFile / probeProcessStartTime / writeLockOwnerMetadata 让文件锁与进程存活
//         探测可在测试中替换，不依赖真实时钟或真实 rename。
// 注入二：beforeRename 用于在 rename 前插入竞态窗口，验证「锁仍在时不得提交」的边界。
// 注入三：renameRetryDelaysMs + lockTimeoutMs + staleLockMs 一起决定重试与过期判定。
// 命名三：Compact 选项的 current 是保留集合，maxAgeMs/maxRecords 是上限约束。
// 命名四：Revoke 选项允许多摘要撤销；省略 hookDeclarationDigests 表示撤销该工作区全部记录。
// 命名五：Path 选项只影响信任文件位置解析（homeDir 覆盖 home，userConfigPath 覆盖配置文件）。
