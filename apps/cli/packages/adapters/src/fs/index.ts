import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Worker } from "node:worker_threads";
import {
  createFileSystemError,
  isFileSystemPortError,
  type FileSystemPort,
  type FileSystemCreateDirectoryRequest,
  type FileSystemCreateDirectoryResult,
  type FileSystemStatRequest,
  type FileSystemStatResult,
  type FileSystemReadTextRequest,
  type FileSystemReadTextResult,
  type FileSystemReadBytesRequest,
  type FileSystemReadBytesResult,
  type FileSystemReadTextRangeRequest,
  type FileSystemReadTextRangeResult,
  type FileSystemWriteTextRequest,
  type FileSystemWriteTextResult,
  type FileSystemRemoveFileRequest,
  type FileSystemRemoveFileResult,
  type FileSystemListDirectoryRequest,
  type FileSystemListDirectoryResult,
  type FileSystemSearchFilesRequest,
  type FileSystemSearchFilesResult,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import {
  absolute,
  aborted,
  byteCount,
  failure,
  nodeKind,
  regular,
  revision,
} from "./node-file-policy.js";
import { bounded, prefix, publish } from "./node-file-io.js";
import {
  applyRequestedLineEndings,
  decodeTextBuffer,
  detectLineEndings,
  encodeTextContent,
  normalizeLineEndings,
  shouldNormalizeLineEndings,
} from "./text-metadata.js";
import { readTextFileRangeFromNode } from "./text-range-reader.js";
import { searchFiles, searchText } from "./node-search.js";
import { maybeThrowStorageFsFault } from "../storage/fs-fault-injection.js";
import {
  setRipgrepWorkerFactoryForTests as setFactory,
  setRipgrepTimeoutMsForTests as setTimeoutBudget,
} from "./ripgrep-worker.js";

type RipgrepWorker = Pick<Worker, "once" | "terminate">;
interface RipgrepWorkerData {
  args: string[];
  preopens: Record<string, string>;
}
type RipgrepWorkerFactory = (workerData: RipgrepWorkerData) => RipgrepWorker;
export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void {
  return setFactory(factory);
}
export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  return setTimeoutBudget(timeoutMs);
}

export interface NodeFileSystemAdapterOptions {
  textSearchEngine?: "ripgrep" | "javascript";
}
/** 公共门面是唯一错误转换与副作用编排入口；内部策略没有第二份用户状态。 */
export class NodeFileSystemAdapter implements FileSystemPort {
  constructor(private readonly adapterOptions: NodeFileSystemAdapterOptions = {}) {}
  async createDirectory(
    request: FileSystemCreateDirectoryRequest,
  ): Promise<FileSystemCreateDirectoryResult> {
    const path = absolute(request.path);
    try {
      maybeThrowStorageFsFault({ operation: "mkdir", path });
      await mkdir(path, { recursive: true });
      return { path };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async stat(request: FileSystemStatRequest): Promise<FileSystemStatResult> {
    const path = absolute(request.path);
    try {
      const info = await stat(path),
        kind = nodeKind(info);
      return {
        path,
        kind,
        sizeBytes: info.size,
        mtimeMs: info.mtimeMs,
        revision: kind === "file" ? revision(info) : undefined,
      };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async readTextFile(request: FileSystemReadTextRequest): Promise<FileSystemReadTextResult> {
    const path = absolute(request.path);
    try {
      const info = await stat(path);
      regular(info, path, "text");
      const truncated = request.maxBytes !== undefined && info.size > request.maxBytes;
      const bytes = truncated ? await prefix(path, request.maxBytes!) : await readFile(path);
      const decoded = decodeTextBuffer({ buffer: bytes, encoding: request.encoding, path });
      const text = shouldNormalizeLineEndings(decoded.encoding);
      return {
        path,
        content: text ? normalizeLineEndings(decoded.content) : decoded.content,
        encoding: decoded.encoding,
        lineEndings: text ? detectLineEndings(decoded.content) : undefined,
        bytesRead: bytes.byteLength,
        sizeBytes: info.size,
        truncated,
        revision: revision(info, bytes),
      };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async readBinaryFile(request: FileSystemReadBytesRequest): Promise<FileSystemReadBytesResult> {
    const path = absolute(request.path);
    try {
      const info = await stat(path);
      regular(info, path, "binary");
      const max = request.maxBytes;
      if (max !== undefined && info.size > max)
        throw createFileSystemError({
          code: "too_large",
          path,
          message: `File content (${byteCount(info.size)}) exceeds maximum allowed size (${byteCount(max)}). Use a smaller file.`,
        });
      // 防止 stat 后增长：只读取 max+1 字节，短读仍推进直至 EOF 或预算。
      const bytes =
        max === undefined ? await readFile(path) : await bounded(path, max + 1, info.size);
      if (max !== undefined && bytes.byteLength > max)
        throw createFileSystemError({
          code: "too_large",
          path,
          message: `File content exceeds maximum allowed size (${byteCount(max)}). Use a smaller file.`,
        });
      return {
        path,
        content: bytes,
        bytesRead: bytes.byteLength,
        sizeBytes: info.size,
        revision: revision(info, bytes),
      };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async readTextFileRange(
    request: FileSystemReadTextRangeRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemReadTextRangeResult> {
    const path = absolute(request.path);
    try {
      const info = await stat(path);
      regular(info, path, "text");
      return await readTextFileRangeFromNode({ ...request, path }, info, options?.signal);
    } catch (error) {
      throw failure(error, path);
    }
  }
  async writeTextFile(request: FileSystemWriteTextRequest): Promise<FileSystemWriteTextResult> {
    const path = absolute(request.path),
      encoding = request.encoding ?? "utf8";
    const bytes = encodeTextContent({
      content: applyRequestedLineEndings(request.content, request.lineEndings),
      encoding,
      path,
    });
    try {
      if (request.expectedRevision && revision(await stat(path)).id !== request.expectedRevision.id)
        throw createFileSystemError({
          code: "stale_write",
          path,
          message: `File changed since it was read: ${path}`,
        });
      if (request.createParents) {
        maybeThrowStorageFsFault({ operation: "mkdir", path: dirname(path) });
        await mkdir(dirname(path), { recursive: true });
      }
      if (request.atomic ?? true) await publish(path, bytes);
      else {
        maybeThrowStorageFsFault({ operation: "writeFile", path });
        await writeFile(path, bytes);
      }
      const info = await stat(path);
      return { path, bytesWritten: bytes.byteLength, revision: revision(info, bytes) };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async removeFile(
    request: FileSystemRemoveFileRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemRemoveFileResult> {
    const path = absolute(request.path);
    try {
      aborted(options?.signal);
      maybeThrowStorageFsFault({ operation: "rm", path });
      await unlink(path);
      return { path, removed: true };
    } catch (error) {
      const normalized = failure(error, path);
      if (
        request.missingOk === true &&
        isFileSystemPortError(normalized) &&
        normalized.code === "not_found"
      )
        return { path, removed: false };
      throw normalized;
    }
  }
  async listDirectory(
    request: FileSystemListDirectoryRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemListDirectoryResult> {
    const path = absolute(request.path),
      startedAt = Date.now();
    try {
      aborted(options?.signal);
      if (!(await stat(path)).isDirectory())
        throw createFileSystemError({
          code: "not_file",
          path,
          message: `Directory listing path must be a directory: ${path}`,
        });
      const rows = await readdir(path, { withFileTypes: true });
      aborted(options?.signal);
      const entries = rows
        .map((entry) => ({ kind: nodeKind(entry), name: entry.name, path: join(path, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        path,
        durationMs: Math.max(0, Date.now() - startedAt),
        entries,
        numEntries: entries.length,
      };
    } catch (error) {
      throw failure(error, path);
    }
  }
  async searchFiles(
    request: FileSystemSearchFilesRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemSearchFilesResult> {
    return searchFiles(request, options?.signal);
  }
  async searchText(
    request: FileSystemSearchTextRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemSearchTextResult> {
    const path = absolute(request.path);
    return searchText(
      request.path === path ? request : { ...request, path },
      this.adapterOptions.textSearchEngine,
      options?.signal,
    );
  }
}
export function createNodeFileSystemAdapter(
  options: NodeFileSystemAdapterOptions = {},
): NodeFileSystemAdapter {
  return new NodeFileSystemAdapter(options);
}
