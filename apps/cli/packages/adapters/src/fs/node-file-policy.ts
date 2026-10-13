// SPDX-License-Identifier: Apache-2.0
// 文件系统策略：路径与错误归一、取消判定、节点类型与体积展示。
import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import type { FileSystemErrorCode } from "@knorvia/contracts";
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

/** 非绝对路径一律拒绝：错误码与文案是契约的一部分。 */
function notAbsolute(path: string): Error {
  const text = "FileSystemPort requires an absolute path: " + path;
  return createFileSystemError({ code: "invalid_path", message: text, path });
}

export function absolute(path: string): string {
  if (!isAbsolute(path)) throw notAbsolute(path);
  return normalize(path);
}

export function code(value: unknown): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return "code" in value ? value.code : undefined;
}

function asCancelled(path: string, cause: unknown): Error {
  const text = "File system operation was cancelled: " + path;
  return createFileSystemError({ cause, code: "cancelled", message: text, path });
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
    code: (mapping?.[0] ?? "io_error") as FileSystemErrorCode,
    message: text,
    path,
  });
}

export function failure(error: unknown, path: string): Error {
  const named = error instanceof Error ? error.name : "";
  if (error instanceof Error && named === "FileSystemPortError") return error;
  if (named === "AbortError") return asCancelled(path, error);
  const errnoCode = code(error);
  const mapping = typeof errnoCode === "string" ? FAILURE_BY_ERRNO.get(errnoCode) : undefined;
  return ioFailure(error, path, mapping);
}

export { aborted, abortError } from "./abort.js";

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

/** 修订号：mtime + size 是稳定标识，hash 只在调用方给了字节时补上。 */
function revisionId(info: { mtimeMs: number; size: number }): string {
  return "mtime:" + Math.trunc(info.mtimeMs) + ":size:" + info.size;
}

export function revision(info: { mtimeMs: number; size: number }, bytes?: Buffer) {
  const meta = {} as {
    hash?: string;
    id: string;
    mtimeMs: number;
    sizeBytes: number;
  };
  meta.id = revisionId(info);
  meta.mtimeMs = info.mtimeMs;
  meta.sizeBytes = info.size;
  if (bytes !== undefined) {
    meta.hash = HASH_PREFIX + createHash("sha256").update(bytes).digest("hex");
  }
  return meta;
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
