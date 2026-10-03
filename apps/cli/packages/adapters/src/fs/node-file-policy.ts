import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import { createFileSystemError, type FileSystemNodeKind } from "@knorvia/contracts";
const KIB = 1024;
const MIB = KIB * KIB;
export function absolute(path: string): string {
  if (!isAbsolute(path))
    throw createFileSystemError({
      code: "invalid_path",
      path,
      message: `FileSystemPort requires an absolute path: ${path}`,
    });
  return normalize(path);
}
export function code(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
}
export function failure(error: unknown, path: string): Error {
  if (error instanceof Error && error.name === "FileSystemPortError") return error;
  if (error instanceof Error && error.name === "AbortError")
    return createFileSystemError({
      code: "cancelled",
      path,
      message: `File system operation was cancelled: ${path}`,
      cause: error,
    });
  const messages = {
    ENOENT: ["not_found", `File not found: ${path}`],
    EACCES: ["permission_denied", `Permission denied for path: ${path}`],
    EPERM: ["permission_denied", `Permission denied for path: ${path}`],
    EISDIR: ["is_directory", `Path is a directory: ${path}`],
    ENAMETOOLONG: ["invalid_path", `Invalid path: ${path}`],
  } as const;
  const key = code(error);
  const detail =
    typeof key === "string" && Object.hasOwn(messages, key)
      ? messages[key as keyof typeof messages]
      : undefined;
  return createFileSystemError({
    code: detail?.[0] ?? "io_error",
    path,
    message:
      detail?.[1] ??
      (error instanceof Error ? error.message : `File system error for path: ${path}`),
    cause: error,
  });
}
export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError("File system operation was cancelled");
}
export function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: "AbortError" });
}
export function nodeKind(info: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileSystemNodeKind {
  return info.isFile()
    ? "file"
    : info.isDirectory()
      ? "directory"
      : info.isSymbolicLink()
        ? "symlink"
        : "other";
}
export function regular(
  info: { isFile(): boolean; isDirectory(): boolean },
  path: string,
  kind: "text" | "binary",
): void {
  if (info.isDirectory())
    throw createFileSystemError({
      code: "is_directory",
      path,
      message: `Cannot read directory as ${kind} file: ${path}`,
    });
  if (!info.isFile())
    throw createFileSystemError({
      code: "not_file",
      path,
      message: `Cannot read non-file path as ${kind}: ${path}`,
    });
}
export function revision(info: { mtimeMs: number; size: number }, bytes?: Buffer) {
  return {
    id: `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`,
    mtimeMs: info.mtimeMs,
    sizeBytes: info.size,
    ...(bytes === undefined
      ? {}
      : { hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` }),
  };
}
export function byteCount(bytes: number): string {
  if (bytes < KIB) return `${bytes}B`;
  const divisor = bytes < MIB ? KIB : MIB,
    n = bytes / divisor;
  return (
    (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "")) +
    (divisor === KIB ? "KB" : "MB")
  );
}
