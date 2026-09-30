import { createReadStream, type Stats } from "node:fs";
import { open, readFile } from "node:fs/promises";
import {
  createFileSystemError,
  type FileSystemTextEncoding,
  type FileSystemReadTextRangeRequest,
  type FileSystemReadTextRangeResult,
} from "@knorvia/contracts";
import {
  createStreamingTextDecoder,
  decodeTextBuffer,
  detectLineEndings,
  detectTextEncoding,
  normalizeLineEndings,
  shouldNormalizeLineEndings,
} from "./text-metadata.js";
import { TextLineWindow } from "./text-line-window.js";

const WHOLE_FILE_THRESHOLD = 10 * 1024 * 1024;
const HEAD_CAPACITY = 4096;
const KIB = 1024;
const MIB = KIB * KIB;
type RangeContent = Pick<
  FileSystemReadTextRangeResult,
  "content" | "encoding" | "lineEndings" | "bytesRead" | "lineCount" | "totalLines"
>;

export async function readTextFileRangeFromNode(
  request: FileSystemReadTextRangeRequest,
  info: Stats,
  signal?: AbortSignal,
): Promise<FileSystemReadTextRangeResult> {
  checkCancellation(signal);
  if (request.maxBytes !== undefined && !(info.size <= request.maxBytes)) {
    throw createFileSystemError({
      code: "too_large",
      path: request.path,
      message: `File content (${displaySize(info.size)}) exceeds maximum allowed size (${displaySize(request.maxBytes)}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
    });
  }
  const offset = Math.max(0, Math.trunc(request.offsetLine ?? 0));
  const limit =
    request.limitLines === undefined ? undefined : Math.max(0, Math.trunc(request.limitLines));
  const result =
    info.size <= WHOLE_FILE_THRESHOLD
      ? await wholeFile(request, offset, limit, signal)
      : await scanFile(request, offset, limit, signal);
  return {
    path: request.path,
    ...result,
    sizeBytes: info.size,
    truncated: false,
    startLine: offset + 1,
    revision: {
      id: `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`,
      mtimeMs: info.mtimeMs,
      sizeBytes: info.size,
    },
  };
}

async function wholeFile(
  request: FileSystemReadTextRangeRequest,
  offset: number,
  limit: number | undefined,
  signal?: AbortSignal,
): Promise<RangeContent> {
  checkCancellation(signal);
  const bytes = await readFile(request.path);
  checkCancellation(signal);
  const { content: raw, encoding } = decodeTextBuffer({
    buffer: bytes,
    encoding: request.encoding,
    path: request.path,
  });
  const text = shouldNormalizeLineEndings(encoding);
  const normalized = text ? normalizeLineEndings(raw) : raw;
  const lines = normalized === "" ? [] : normalized.split("\n");
  const selected = limit === undefined ? lines.slice(offset) : lines.slice(offset, offset + limit);
  return {
    content: selected.join("\n"),
    encoding,
    lineEndings: text ? detectLineEndings(raw) : undefined,
    bytesRead: bytes.length,
    lineCount: selected.length,
    totalLines: lines.length,
  };
}

async function scanFile(
  request: FileSystemReadTextRangeRequest,
  offset: number,
  limit: number | undefined,
  signal?: AbortSignal,
): Promise<RangeContent> {
  const encoding = request.encoding ?? (await sampleEncoding(request.path, signal));
  const decoder = createStreamingTextDecoder(encoding);
  const window = new TextLineWindow(offset, limit);
  const stream = createReadStream(request.path);
  const abort = (): void => {
    stream.destroy(cancelled(request.path));
  };
  let bytesRead = 0;
  let sawBytes = false;
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) {
      checkCancellation(signal);
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += bytes.length;
      sawBytes ||= bytes.length > 0;
      // 修复：旧 carry+chunk 每次重拼未选中的长行，64MiB 反例额外 heap 超过 600MiB。
      // 窗口仅收集选中行；每个 chunk 的新字符被扫描一次，仍完整统计文件。
      window.write(decoder.write(bytes));
    }
    window.finish(decoder.end(), sawBytes);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  return {
    content: window.lines.join("\n"),
    encoding,
    lineEndings: window.lineEndings,
    bytesRead,
    lineCount: window.lines.length,
    totalLines: window.totalLines,
  };
}

async function sampleEncoding(path: string, signal?: AbortSignal): Promise<FileSystemTextEncoding> {
  checkCancellation(signal);
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(HEAD_CAPACITY);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return detectTextEncoding(head.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function displaySize(bytes: number): string {
  if (bytes < KIB) return `${bytes}B`;
  const scale = bytes < MIB ? KIB : MIB;
  const value = bytes / scale;
  const numeral = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return numeral + (scale === KIB ? "KB" : "MB");
}

function cancelled(path: string): Error {
  return Object.assign(new Error(`File system operation was cancelled: ${path}`), {
    name: "AbortError",
  });
}
function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled("file range read");
}
