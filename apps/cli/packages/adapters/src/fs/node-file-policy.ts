// SPDX-License-Identifier: Apache-2.0
// 文件系统策略：路径与错误归一、取消判定、节点类型与体积展示。
import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import { createFileSystemError, type FileSystemNodeKind } from "@knorvia/contracts";

const KIB = 1024;
const MIB = KIB * KIB;
const HASH_PREFIX = "sha256:";

/** 节点形状：判定表按方法名调用，避免逐层三元表达式。 */
interface NodeInfo {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

/** 只需要「是否目录 / 是否文件」两问的读取前置检查。 */
interface ReadableInfo {
  isDirectory(): boolean;
  isFile(): boolean;
}

/** errno → [错误码, 文案构造器]；未列出的 errno 走 io_error。 */
const FAILURE_BY_ERRNO: ReadonlyMap<string, readonly [string, (path: string) => string]> = new Map([
  ["ENOENT", ["not_found", (path) => `File not found: ${path}`]],
  ["EACCES", ["permission_denied", (path) => `Permission denied for path: ${path}`]],
  ["EPERM", ["permission_denied", (path) => `Permission denied for path: ${path}`]],
  ["EISDIR", ["is_directory", (path) => `Path is a directory: ${path}`]],
  ["ENAMETOOLONG", ["invalid_path", (path) => `Invalid path: ${path}`]],
]);

/** 节点类型判定表：顺序即优先级（file → directory → symlink → other）。 */
const KIND_BY_PREDICATE = [
  ["isFile", "file"],
  ["isDirectory", "directory"],
  ["isSymbolicLink", "symlink"],
] as const satisfies ReadonlyArray<readonly [string, FileSystemNodeKind]>;

/** 体积单位表：从大到小命中第一个不超过的档位。 */
const SIZE_UNITS = [
  [MIB, "MB"],
  [KIB, "KB"],
] as const;

export function absolute(path: string): string {
  if (!isAbsolute(path)) {
    const message = `FileSystemPort requires an absolute path: ${path}`;
    throw createFileSystemError({ code: "invalid_path", message, path });
  }
  return normalize(path);
}

export function code(error: unknown): unknown {
  if (error === null || typeof error !== "object") return undefined;
  return "code" in error ? error.code : undefined;
}

function cancelled(path: string, cause: unknown): Error {
  return createFileSystemError({
    cause,
    code: "cancelled",
    message: `File system operation was cancelled: ${path}`,
    path,
  });
}

function ioFailure(
  error: unknown,
  path: string,
  mapping: readonly [string, (path: string) => string] | undefined,
): Error {
  const fallback = error instanceof Error ? error.message : "File system error for path: " + path;
  const text = mapping === undefined ? fallback : mapping[1](path);
  return createFileSystemError({
    cause: error,
    code: mapping?.[0] ?? "io_error",
    message: text,
    path,
  });
}

export function failure(error: unknown, path: string): Error {
  if (error instanceof Error && error.name === "FileSystemPortError") return error;
  if (error instanceof Error && error.name === "AbortError") return cancelled(path, error);
  const errnoCode = code(error);
  const mapping = typeof errnoCode === "string" ? FAILURE_BY_ERRNO.get(errnoCode) : undefined;
  return ioFailure(error, path, mapping);
}

export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError("File system operation was cancelled");
}

export function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: "AbortError" });
}

export function nodeKind(info: NodeInfo): FileSystemNodeKind {
  for (const [predicate, kind] of KIND_BY_PREDICATE) {
    if (info[predicate]()) return kind;
  }
  return "other";
}

export function regular(info: ReadableInfo, path: string, kind: "text" | "binary"): void {
  if (info.isDirectory()) {
    const reason = "Cannot read directory as " + kind + " file: " + path;
    throw createFileSystemError({ code: "is_directory", message: reason, path });
  }
  if (!info.isFile()) {
    const reason = "Cannot read non-file path as " + kind + ": " + path;
    throw createFileSystemError({ code: "not_file", message: reason, path });
  }
}

export function revision(info: { mtimeMs: number; size: number }, bytes?: Buffer) {
  const revisionInfo = {} as {
    hash?: string;
    id: string;
    mtimeMs: number;
    sizeBytes: number;
  };
  revisionInfo.id = `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`;
  revisionInfo.mtimeMs = info.mtimeMs;
  revisionInfo.sizeBytes = info.size;
  if (bytes !== undefined) {
    revisionInfo.hash = HASH_PREFIX + createHash("sha256").update(bytes).digest("hex");
  }
  return revisionInfo;
}

function formatSize(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/u, "");
}

export function byteCount(bytes: number): string {
  for (const [unit, suffix] of SIZE_UNITS) {
    if (bytes >= unit) return formatSize(bytes / unit) + suffix;
  }
  return `${bytes}B`;
}
