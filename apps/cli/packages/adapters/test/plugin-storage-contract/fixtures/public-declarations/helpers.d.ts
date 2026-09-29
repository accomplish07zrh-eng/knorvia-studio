// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

export declare function resolveInside(rootPath: string, rawPath: string): string | null;
export declare function sanitizePluginId(pluginId: string): string;
export declare function parsePathList(value: unknown): string[];
export declare function isPluginOptionValue(value: unknown): value is string | number | boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function directoryExists(path: string): boolean;
/**
 * 「路径缺失」只认 ENOENT/ENOTDIR（stat 的精确错误码）。EACCES 等权限错误
 * 不是缺失——调用方不得据此发「不存在」诊断，避免把权限问题误报成 manifest 配错。
 */
export declare function isMissingPath(path: string): boolean;
export declare function fileExists(path: string): boolean;
export declare function isNotFoundError(error: unknown): boolean;
export declare function cleanupPluginSourceBestEffort(
  cleanup: (() => Promise<void>) | undefined,
  retryDelaysMs?: readonly number[],
): Promise<unknown>;
export declare function appendPluginSourceCleanupError(
  primaryError: unknown,
  cleanupError: unknown,
): unknown;
export declare function throwIfAborted(
  options:
    | {
        signal?: AbortSignal;
      }
    | undefined,
): void;
//# sourceMappingURL=helpers.d.ts.map
