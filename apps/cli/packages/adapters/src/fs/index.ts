// SPDX-License-Identifier: Apache-2.0
// 文件系统门面：唯一错误转换与副作用编排入口；每个方法只表达意图，细节在内部模块。
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { maybeThrowStorageFsFault } from "../storage/fs-fault-injection.js";
import { bounded, prefix, publish } from "./node-file-io.js";
import {
  absolute,
  aborted,
  byteCount,
  failure,
  nodeKind,
  regular,
  revision,
} from "./node-file-policy.js";
import { searchFiles, searchText } from "./node-search.js";
import type { RipgrepWorkerFactory } from "./ripgrep-worker-types.js";
import {
  setRipgrepWorkerFactoryForTests as setWorkerFactory,
  setRipgrepTimeoutMsForTests as setWorkerTimeout,
} from "./ripgrep-worker.js";
import {
  applyRequestedLineEndings,
  decodeTextBuffer,
  detectLineEndings,
  encodeTextContent,
  normalizeLineEndings,
  shouldNormalizeLineEndings,
} from "./text-metadata.js";
import { readTextFileRangeFromNode } from "./text-range-reader.js";

export function setRipgrepWorkerFactoryForTests(
  factory: RipgrepWorkerFactory | undefined,
): () => void {
  return setWorkerFactory(factory);
}

export function setRipgrepTimeoutMsForTests(timeoutMs: number | undefined): () => void {
  return setWorkerTimeout(timeoutMs);
}

export interface NodeFileSystemAdapterOptions {
  textSearchEngine?: "ripgrep" | "javascript";
}

/** 统一的失败转换：任何未归类异常都按路径归一成 FileSystemPortError。 */
async function guarded<T>(target: string, body: () => Promise<T> | T): Promise<T> {
  try {
    return await body();
  } catch (cause) {
    throw failure(cause, target);
  }
}

function tooLargeBytesError(target: string, message: string): Error {
  return createFileSystemError({ code: "too_large", message, path: target });
}

/** 公共门面是唯一错误转换与副作用编排入口；内部策略没有第二份用户状态。 */
export class NodeFileSystemAdapter implements FileSystemPort {
  constructor(private readonly adapterOptions: NodeFileSystemAdapterOptions = {}) {}

  async createDirectory(
    request: FileSystemCreateDirectoryRequest,
  ): Promise<FileSystemCreateDirectoryResult> {
    const target = absolute(request.path);
    return await guarded(target, async () => {
      maybeThrowStorageFsFault({ operation: "mkdir", path: target });
      await mkdir(target, { recursive: true });
      return { path: target };
    });
  }

  async stat(request: FileSystemStatRequest): Promise<FileSystemStatResult> {
    const target = absolute(request.path);
    return await guarded(target, async () => {
      const info = await stat(target);
      const kind = nodeKind(info);
      const result = {} as FileSystemStatResult;
      result.path = target;
      result.kind = kind;
      result.sizeBytes = info.size;
      result.mtimeMs = info.mtimeMs;
      result.revision = kind === "file" ? revision(info) : undefined;
      return result;
    });
  }

  async readTextFile(request: FileSystemReadTextRequest): Promise<FileSystemReadTextResult> {
    const target = absolute(request.path);
    return await guarded(target, async () => {
      const info = await stat(target);
      regular(info, target, "text");
      const overBudget = request.maxBytes !== undefined && info.size > request.maxBytes;
      const bytes = overBudget ? await prefix(target, request.maxBytes!) : await readFile(target);
      const decoded = decodeTextBuffer({ buffer: bytes, encoding: request.encoding, path: target });
      const normalizes = shouldNormalizeLineEndings(decoded.encoding);
      const result = {} as FileSystemReadTextResult;
      result.path = target;
      result.content = normalizes ? normalizeLineEndings(decoded.content) : decoded.content;
      result.encoding = decoded.encoding;
      result.lineEndings = normalizes ? detectLineEndings(decoded.content) : undefined;
      result.bytesRead = bytes.byteLength;
      result.sizeBytes = info.size;
      result.truncated = overBudget;
      result.revision = revision(info, bytes);
      return result;
    });
  }

  async readBinaryFile(request: FileSystemReadBytesRequest): Promise<FileSystemReadBytesResult> {
    const target = absolute(request.path);
    return await guarded(target, async () => {
      const info = await stat(target);
      regular(info, target, "binary");
      const max = request.maxBytes;
      if (max !== undefined && info.size > max) {
        const message =
          `File content (${byteCount(info.size)}) exceeds maximum allowed size (${byteCount(max)}). ` +
          "Use a smaller file.";
        throw tooLargeBytesError(target, message);
      }
      // 防止 stat 后增长：只读取 max+1 字节，短读仍推进直至 EOF 或预算。
      const bytes =
        max === undefined ? await readFile(target) : await bounded(target, max + 1, info.size);
      if (max !== undefined && bytes.byteLength > max) {
        const message = `File content exceeds maximum allowed size (${byteCount(max)}). Use a smaller file.`;
        throw tooLargeBytesError(target, message);
      }
      const result = {} as FileSystemReadBytesResult;
      result.path = target;
      result.content = bytes;
      result.bytesRead = bytes.byteLength;
      result.sizeBytes = info.size;
      result.revision = revision(info, bytes);
      return result;
    });
  }

  async readTextFileRange(
    request: FileSystemReadTextRangeRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemReadTextRangeResult> {
    const target = absolute(request.path);
    return await guarded(target, async () => {
      const info = await stat(target);
      regular(info, target, "text");
      return await readTextFileRangeFromNode({ ...request, path: target }, info, options?.signal);
    });
  }

  async writeTextFile(request: FileSystemWriteTextRequest): Promise<FileSystemWriteTextResult> {
    const target = absolute(request.path);
    const encoding = request.encoding ?? "utf8";
    const bytes = encodeTextContent({
      content: applyRequestedLineEndings(request.content, request.lineEndings),
      encoding,
      path: target,
    });
    return await guarded(target, async () => {
      const expected = request.expectedRevision;
      if (expected !== undefined && revision(await stat(target)).id !== expected.id) {
        const message = `File changed since it was read: ${target}`;
        throw createFileSystemError({ code: "stale_write", message, path: target });
      }
      if (request.createParents) {
        const parent = dirname(target);
        maybeThrowStorageFsFault({ operation: "mkdir", path: parent });
        await mkdir(parent, { recursive: true });
      }
      if (request.atomic ?? true) {
        await publish(target, bytes);
      } else {
        maybeThrowStorageFsFault({ operation: "writeFile", path: target });
        await writeFile(target, bytes);
      }
      const info = await stat(target);
      const result = {} as FileSystemWriteTextResult;
      result.path = target;
      result.bytesWritten = bytes.byteLength;
      result.revision = revision(info, bytes);
      return result;
    });
  }

  async removeFile(
    request: FileSystemRemoveFileRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemRemoveFileResult> {
    const target = absolute(request.path);
    try {
      aborted(options?.signal);
      maybeThrowStorageFsFault({ operation: "rm", path: target });
      await unlink(target);
      return { path: target, removed: true };
    } catch (cause) {
      const normalized = failure(cause, target);
      const tolerated =
        request.missingOk === true &&
        isFileSystemPortError(normalized) &&
        normalized.code === "not_found";
      if (tolerated) return { path: target, removed: false };
      throw normalized;
    }
  }

  async listDirectory(
    request: FileSystemListDirectoryRequest,
    options?: { signal?: AbortSignal },
  ): Promise<FileSystemListDirectoryResult> {
    const target = absolute(request.path);
    const startedAt = Date.now();
    return await guarded(target, async () => {
      aborted(options?.signal);
      const info = await stat(target);
      if (!info.isDirectory()) {
        const message = `Directory listing path must be a directory: ${target}`;
        throw createFileSystemError({ code: "not_file", message, path: target });
      }
      const dirents = await readdir(target, { withFileTypes: true });
      aborted(options?.signal);
      const entries = dirents
        .map((entry) => ({
          kind: nodeKind(entry),
          name: entry.name,
          path: join(target, entry.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const result = {} as FileSystemListDirectoryResult;
      result.path = target;
      result.durationMs = Math.max(0, Date.now() - startedAt);
      result.entries = entries;
      result.numEntries = entries.length;
      return result;
    });
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
    const target = absolute(request.path);
    const normalized = request.path === target ? request : { ...request, path: target };
    return searchText(normalized, this.adapterOptions.textSearchEngine, options?.signal);
  }
}

export function createNodeFileSystemAdapter(
  options: NodeFileSystemAdapterOptions = {},
): NodeFileSystemAdapter {
  return new NodeFileSystemAdapter(options);
}
