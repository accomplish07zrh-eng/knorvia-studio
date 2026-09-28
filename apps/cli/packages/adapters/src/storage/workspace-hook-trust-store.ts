// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

function identity(record: { workspaceIdentity: string; hookDeclarationDigest: string }): string {
  return JSON.stringify([record.workspaceIdentity, record.hookDeclarationDigest]);
}

function lastUse(record: WorkspaceHookTrustRecord): number {
  return Date.parse(record.lastUsedAt ?? record.grantedAt);
}

export class FileWorkspaceHookTrustStore {
  readonly #filePath: string;
  readonly #lockPath: string;
  readonly #now: () => number;
  readonly #lockOptions: TrustLockOptions;
  readonly #publishOptions: TrustPublishOptions;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: FileWorkspaceHookTrustStoreOptions) {
    this.#filePath = resolve(options.filePath);
    this.#lockPath = `${this.#filePath}.lock`;
    this.#now = options.now ?? Date.now;
    this.#lockOptions = {
      lockTimeoutMs: options.lockTimeoutMs,
      staleLockMs: options.staleLockMs,
      probeProcessStartTime: options.probeProcessStartTime,
      writeLockOwnerMetadata: options.writeLockOwnerMetadata,
    };
    this.#publishOptions = {
      beforeRename: options.beforeRename,
      renameFile: options.renameFile,
      renameRetryDelaysMs: options.renameRetryDelaysMs,
    };
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(async () => {
      await prepareTrustDirectory(this.#filePath);
      return withTrustLock(this.#lockPath, this.#lockOptions, operation);
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #change(
    transform: (records: WorkspaceHookTrustRecord[]) => WorkspaceHookTrustRecord[],
  ): Promise<WorkspaceHookTrustStoreFile> {
    return this.#enqueue(async () => {
      const current = await readTrustFile(this.#filePath, this.#now);
      const next = workspaceHookTrustStoreFileSchema.parse({
        schemaVersion: WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION,
        records: transform(current.records),
      });
      await writeTrustFile(this.#filePath, next, this.#publishOptions);
      return next;
    });
  }

  load(): Promise<WorkspaceHookTrustStoreLoadResult> {
    return this.#enqueue(() => readTrustFile(this.#filePath, this.#now));
  }

  grant(records: readonly WorkspaceHookTrustRecord[]): Promise<WorkspaceHookTrustStoreFile> {
    const prepared = records.map((record) => workspaceHookTrustRecordSchema.parse(record));
    return this.#change((current) => {
      const merged = new Map(current.map((record) => [identity(record), record]));
      for (const record of prepared) merged.set(identity(record), record);
      return [...merged.values()];
    });
  }

  revoke(options: WorkspaceHookTrustStoreRevokeOptions): Promise<WorkspaceHookTrustStoreFile> {
    const requested = options.hookDeclarationDigests;
    if (requested?.length === 0) {
      return Promise.reject(new Error("hookDeclarationDigests must be undefined or non-empty"));
    }
    // 运行时 null 沿用未指定列表的撤销语义，不扩展公开类型。
    const digests = requested == null ? undefined : new Set(requested);
    return this.#change((records) =>
      records.filter(
        (record) =>
          record.workspaceIdentity !== options.workspaceIdentity ||
          (digests !== undefined && !digests.has(record.hookDeclarationDigest)),
      ),
    );
  }

  touch(input: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
    usedAt?: string;
  }): Promise<WorkspaceHookTrustStoreFile> {
    const digests = new Set(input.hookDeclarationDigests);
    const usedAt = input.usedAt ?? new Date(this.#now()).toISOString();
    return this.#change((records) =>
      records.map((record) =>
        record.workspaceIdentity === input.workspaceIdentity &&
        digests.has(record.hookDeclarationDigest)
          ? { ...record, lastUsedAt: usedAt }
          : record,
      ),
    );
  }

  compact(options: WorkspaceHookTrustStoreCompactOptions): Promise<WorkspaceHookTrustStoreFile> {
    if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) {
      throw new Error("maxAgeMs must be a nonnegative finite number");
    }
    if (!Number.isInteger(options.maxRecords) || options.maxRecords <= 0) {
      throw new Error("maxRecords must be a positive integer");
    }
    const now = options.now ?? this.#now();
    const current = new Set(options.current.map(identity));
    return this.#change((records) => {
      const retained: WorkspaceHookTrustRecord[] = [];
      const candidates: WorkspaceHookTrustRecord[] = [];
      for (const record of records) {
        if (current.has(identity(record))) retained.push(record);
        else if (now - lastUse(record) <= options.maxAgeMs) candidates.push(record);
      }
      candidates.sort((left, right) => lastUse(right) - lastUse(left));
      return retained.concat(
        candidates.slice(0, Math.max(0, options.maxRecords - retained.length)),
      );
    });
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
