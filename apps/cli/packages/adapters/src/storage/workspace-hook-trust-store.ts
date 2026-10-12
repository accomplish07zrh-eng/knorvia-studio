// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 信任库文件门面：所有读写串行化到一条 Promise 队列上，再经文件锁与原子写落盘。
// 形状声明与路径解析分别来自 types / path 模块；四个记录变换是纯函数，便于单独验证。

import { resolve } from "node:path";
import {
  WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION,
  workspaceHookTrustRecordSchema,
  workspaceHookTrustStoreFileSchema,
} from "@knorvia/contracts";
import type { WorkspaceHookTrustRecord, WorkspaceHookTrustStoreFile } from "@knorvia/contracts";
import {
  prepareTrustDirectory,
  readTrustFile,
  writeTrustFile,
} from "./workspace-hook-trust-file.js";
import type { TrustPublishOptions } from "./workspace-hook-trust-file.js";
import { withTrustLock } from "./workspace-hook-trust-lock.js";
import type { TrustLockOptions } from "./workspace-hook-trust-lock.js";
import { resolveWorkspaceHookTrustStorePath } from "./workspace-hook-trust-path.js";
import type {
  FileWorkspaceHookTrustStoreOptions,
  WorkspaceHookTrustStoreCompactOptions,
  WorkspaceHookTrustStoreLoadResult,
  WorkspaceHookTrustStorePathOptions,
  WorkspaceHookTrustStoreRevokeOptions,
} from "./workspace-hook-trust-types.js";

export { resolveWorkspaceHookTrustStorePath } from "./workspace-hook-trust-path.js";
export type {
  FileWorkspaceHookTrustStoreOptions,
  WorkspaceHookTrustStoreCompactOptions,
  WorkspaceHookTrustStoreLoadResult,
  WorkspaceHookTrustStorePathOptions,
  WorkspaceHookTrustStoreRevokeOptions,
} from "./workspace-hook-trust-types.js";

/** 记录去重键：工作区身份 + 声明摘要，缺一不可。 */
function recordKey(record: { workspaceIdentity: string; hookDeclarationDigest: string }): string {
  return JSON.stringify([record.workspaceIdentity, record.hookDeclarationDigest]);
}

/** 最近使用时间：优先 lastUsedAt，缺失时退回 grantedAt。 */
function lastUsedAtMs(record: WorkspaceHookTrustRecord): number {
  return Date.parse(record.lastUsedAt ?? record.grantedAt);
}

/** 授予：同键覆盖，保留已有顺序之后追加新记录。 */
function mergeGrants(
  current: WorkspaceHookTrustRecord[],
  granted: readonly WorkspaceHookTrustRecord[],
): WorkspaceHookTrustRecord[] {
  const byKey = new Map(current.map((record) => [recordKey(record), record]));
  for (const record of granted) byKey.set(recordKey(record), record);
  return [...byKey.values()];
}

/** 撤销：不带摘要即整工作区撤销，带摘要则只撤销列出的那些。 */
function filterRevoked(
  records: WorkspaceHookTrustRecord[],
  settings: WorkspaceHookTrustStoreRevokeOptions,
  digests: ReadonlySet<string> | undefined,
): WorkspaceHookTrustRecord[] {
  return records.filter(
    (record) =>
      record.workspaceIdentity !== settings.workspaceIdentity ||
      (digests !== undefined && !digests.has(record.hookDeclarationDigest)),
  );
}

/** 触碰：命中工作区与摘要的记录写入新的 lastUsedAt。 */
function applyTouch(
  records: WorkspaceHookTrustRecord[],
  settings: { workspaceIdentity: string; hookDeclarationDigests: readonly string[] },
  usedAt: string,
): WorkspaceHookTrustRecord[] {
  const digests = new Set(settings.hookDeclarationDigests);
  return records.map((record) => {
    const hit =
      record.workspaceIdentity === settings.workspaceIdentity &&
      digests.has(record.hookDeclarationDigest);
    return hit ? { ...record, lastUsedAt: usedAt } : record;
  });
}

/** 压缩：保留集合原样留下，其余按最近使用倒序补足到 maxRecords。 */
function compactRecords(
  records: WorkspaceHookTrustRecord[],
  settings: WorkspaceHookTrustStoreCompactOptions,
  pinned: ReadonlySet<string>,
  at: number,
): WorkspaceHookTrustRecord[] {
  const keep: WorkspaceHookTrustRecord[] = [];
  const fresh: WorkspaceHookTrustRecord[] = [];
  for (const record of records) {
    if (pinned.has(recordKey(record))) keep.push(record);
    else if (at - lastUsedAtMs(record) <= settings.maxAgeMs) fresh.push(record);
  }
  fresh.sort((left, right) => lastUsedAtMs(right) - lastUsedAtMs(left));
  const room = Math.max(0, settings.maxRecords - keep.length);
  return keep.concat(fresh.slice(0, room));
}

function lockSettingsFrom(options: FileWorkspaceHookTrustStoreOptions): TrustLockOptions {
  const settings = {} as TrustLockOptions;
  settings.lockTimeoutMs = options.lockTimeoutMs;
  settings.staleLockMs = options.staleLockMs;
  settings.probeProcessStartTime = options.probeProcessStartTime;
  settings.writeLockOwnerMetadata = options.writeLockOwnerMetadata;
  return settings;
}

function publishSettingsFrom(options: FileWorkspaceHookTrustStoreOptions): TrustPublishOptions {
  const settings = {} as TrustPublishOptions;
  settings.beforeRename = options.beforeRename;
  settings.renameFile = options.renameFile;
  settings.renameRetryDelaysMs = options.renameRetryDelaysMs;
  return settings;
}

export class FileWorkspaceHookTrustStore {
  readonly #targetFile: string;
  readonly #lockFile: string;
  readonly #clock: () => number;
  readonly #lockSettings: TrustLockOptions;
  readonly #publishSettings: TrustPublishOptions;
  #queue: Promise<void> = Promise.resolve();

  constructor(options: FileWorkspaceHookTrustStoreOptions) {
    this.#targetFile = resolve(options.filePath);
    this.#lockFile = `${this.#targetFile}.lock`;
    this.#clock = options.now ?? Date.now;
    this.#lockSettings = lockSettingsFrom(options);
    this.#publishSettings = publishSettingsFrom(options);
  }

  /** 串行化：先建目录，再在文件锁内执行；队列本身永不因失败而中断。 */
  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(async () => {
      await prepareTrustDirectory(this.#targetFile);
      return await withTrustLock(this.#lockFile, this.#lockSettings, operation);
    });
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** 读改写一体：读当前文件 → 应用变换 → 校验 schema 版本 → 原子写回。 */
  #mutate(
    apply: (records: WorkspaceHookTrustRecord[]) => WorkspaceHookTrustRecord[],
  ): Promise<WorkspaceHookTrustStoreFile> {
    return this.#serialize(async () => {
      const current = await readTrustFile(this.#targetFile, this.#clock);
      const written = workspaceHookTrustStoreFileSchema.parse({
        schemaVersion: WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION,
        records: apply(current.records),
      });
      await writeTrustFile(this.#targetFile, written, this.#publishSettings);
      return written;
    });
  }

  load(): Promise<WorkspaceHookTrustStoreLoadResult> {
    return this.#serialize(() => readTrustFile(this.#targetFile, this.#clock));
  }

  grant(entries: readonly WorkspaceHookTrustRecord[]): Promise<WorkspaceHookTrustStoreFile> {
    const granted = entries.map((record) => workspaceHookTrustRecordSchema.parse(record));
    return this.#mutate((current) => mergeGrants(current, granted));
  }

  revoke(settings: WorkspaceHookTrustStoreRevokeOptions): Promise<WorkspaceHookTrustStoreFile> {
    const requested = settings.hookDeclarationDigests;
    if (requested?.length === 0) {
      return Promise.reject(new Error("hookDeclarationDigests must be undefined or non-empty"));
    }
    // 运行时 null 沿用未指定列表的撤销语义，不扩展公开类型。
    const digests = requested == null ? undefined : new Set(requested);
    return this.#mutate((records) => filterRevoked(records, settings, digests));
  }

  touch(input: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
    usedAt?: string;
  }): Promise<WorkspaceHookTrustStoreFile> {
    const usedAt = input.usedAt ?? new Date(this.#clock()).toISOString();
    return this.#mutate((records) => applyTouch(records, input, usedAt));
  }

  compact(settings: WorkspaceHookTrustStoreCompactOptions): Promise<WorkspaceHookTrustStoreFile> {
    if (!Number.isFinite(settings.maxAgeMs) || settings.maxAgeMs < 0) {
      throw new Error("maxAgeMs must be a nonnegative finite number");
    }
    if (!Number.isInteger(settings.maxRecords) || settings.maxRecords <= 0) {
      throw new Error("maxRecords must be a positive integer");
    }
    const at = settings.now ?? this.#clock();
    const pinned = new Set(settings.current.map(recordKey));
    return this.#mutate((records) => compactRecords(records, settings, pinned, at));
  }
}

export function createFileWorkspaceHookTrustStore(
  options: FileWorkspaceHookTrustStoreOptions,
): FileWorkspaceHookTrustStore {
  return new FileWorkspaceHookTrustStore(options);
}

export async function createDefaultFileWorkspaceHookTrustStore(
  options: WorkspaceHookTrustStorePathOptions &
    Omit<FileWorkspaceHookTrustStoreOptions, "filePath"> = {},
): Promise<FileWorkspaceHookTrustStore> {
  // 等待路径解析前固定构造选项，避免 pending 期间更换调用者对象中的回调。
  const storeOptions = { ...options };
  const filePath = await resolveWorkspaceHookTrustStorePath(options);
  return new FileWorkspaceHookTrustStore({ ...storeOptions, filePath });
}
