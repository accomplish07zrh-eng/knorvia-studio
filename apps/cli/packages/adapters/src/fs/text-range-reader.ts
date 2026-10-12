// SPDX-License-Identifier: Apache-2.0
// 文本范围读取：小文件整读、大文件流式扫描；取消与体积上限都在入口判定。
import { createReadStream, type Stats } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createFileSystemError,
  type FileSystemReadTextRangeRequest,
  type FileSystemReadTextRangeResult,
  type FileSystemTextEncoding,
} from "@knorvia/contracts";
import { abortError } from "./abort.js";
import { prefix } from "./read-primitives.js";
import { TextLineWindow } from "./text-line-window.js";
import {
  createStreamingTextDecoder,
  decodeTextBuffer,
  detectLineEndings,
  detectTextEncoding,
  normalizeLineEndings,
  shouldNormalizeLineEndings,
} from "./text-metadata.js";

const WHOLE_FILE_THRESHOLD = 10 * 1024 * 1024;
const HEAD_CAPACITY = 4096;
const KIB = 1024;
const MIB = KIB * KIB;
const CANCEL_SCOPE = "file range read";

type RangeContent = Pick<
  FileSystemReadTextRangeResult,
  "content" | "encoding" | "lineEndings" | "bytesRead" | "lineCount" | "totalLines"
>;

/** 两条读取路径共用的输入：请求 + 已解析的行区间 + 取消信号。 */
interface RangeInput {
  limit: number | undefined;
  offset: number;
  request: FileSystemReadTextRangeRequest;
  signal: AbortSignal | undefined;
}

function cancelled(scope: string): Error {
  return abortError(`File system operation was cancelled: ${scope}`);
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled(CANCEL_SCOPE);
}

function displaySize(bytes: number): string {
  for (const [unit, suffix] of [
    [MIB, "MB"],
    [KIB, "KB"],
  ] as const) {
    if (bytes >= unit) {
      const value = bytes / unit;
      const numeral = Number.isInteger(value)
        ? String(value)
        : value.toFixed(1).replace(/\.0$/u, "");
      return numeral + suffix;
    }
  }
  return String(bytes) + "B";
}

function tooLargeError(request: FileSystemReadTextRangeRequest, size: number): Error {
  const actual = displaySize(size);
  const allowed = displaySize(request.maxBytes ?? 0);
  const message =
    `File content (${actual}) exceeds maximum allowed size (${allowed}). ` +
    "Use offset and limit parameters to read specific portions of the file, " +
    "or search for specific content instead of reading the whole file.";
  return createFileSystemError({ code: "too_large", message, path: request.path });
}

function revisionOf(info: Stats): { id: string; mtimeMs: number; sizeBytes: number } {
  const revision = {} as { id: string; mtimeMs: number; sizeBytes: number };
  revision.id = `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`;
  revision.mtimeMs = info.mtimeMs;
  revision.sizeBytes = info.size;
  return revision;
}

/** 小文件：整块读入后切行，selected 为最终返回的行集合。 */
async function wholeFile(input: RangeInput): Promise<RangeContent> {
  const { request, signal } = input;
  checkCancellation(signal);
  const bytes = await readFile(request.path);
  checkCancellation(signal);
  const { content: raw, encoding } = decodeTextBuffer({
    buffer: bytes,
    encoding: request.encoding,
    path: request.path,
  });
  const normalizeEndings = shouldNormalizeLineEndings(encoding);
  const normalized = normalizeEndings ? normalizeLineEndings(raw) : raw;
  const lines = normalized === "" ? [] : normalized.split("\n");
  const selected =
    input.limit === undefined
      ? lines.slice(input.offset)
      : lines.slice(input.offset, input.offset + input.limit);
  const content = {} as RangeContent;
  content.content = selected.join("\n");
  content.encoding = encoding;
  content.lineEndings = normalizeEndings ? detectLineEndings(raw) : undefined;
  content.bytesRead = bytes.length;
  content.lineCount = selected.length;
  content.totalLines = lines.length;
  return content;
}

/** 大文件：流式解码进 TextLineWindow，只在窗口内保留被选中的行。 */
async function scanFile(input: RangeInput): Promise<RangeContent> {
  const { request, signal } = input;
  const encoding = request.encoding ?? (await sampleEncoding(request.path, signal));
  const decoder = createStreamingTextDecoder(encoding);
  const collector = new TextLineWindow(input.offset, input.limit);
  const stream = createReadStream(request.path);
  const onAbort = (): void => {
    stream.destroy(cancelled(request.path));
  };
  let consumed = 0;
  let hasBytes = false;
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for await (const piece of stream) {
      checkCancellation(signal);
      const buffer = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
      consumed += buffer.length;
      hasBytes = hasBytes || buffer.length > 0;
      // 未选中的长行不再跨 chunk 重拼（旧实现 64MiB 反例额外 heap 超过 600MiB）；
      // 每个 chunk 的内容只扫描一次，总行数仍然完整统计。
      collector.write(decoder.write(buffer));
    }
    collector.finish(decoder.end(), hasBytes);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  const content = {} as RangeContent;
  content.content = collector.lines.join("\n");
  content.encoding = encoding;
  content.lineEndings = collector.lineEndings;
  content.bytesRead = consumed;
  content.lineCount = collector.lines.length;
  content.totalLines = collector.totalLines;
  return content;
}

/** 编码采样：只读文件头 4KiB，不经二进制筛选。 */
async function sampleEncoding(path: string, signal?: AbortSignal): Promise<FileSystemTextEncoding> {
  checkCancellation(signal);
  const head = await prefix(path, HEAD_CAPACITY);
  return detectTextEncoding(head);
}

export async function readTextFileRangeFromNode(
  request: FileSystemReadTextRangeRequest,
  info: Stats,
  signal?: AbortSignal,
): Promise<FileSystemReadTextRangeResult> {
  checkCancellation(signal);
  const cap = request.maxBytes;
  if (cap !== undefined && info.size > cap) throw tooLargeError(request, info.size);

  const offset = Math.max(0, Math.trunc(request.offsetLine ?? 0));
  const limit =
    request.limitLines === undefined ? undefined : Math.max(0, Math.trunc(request.limitLines));
  const input: RangeInput = { limit, offset, request, signal };
  const range = info.size <= WHOLE_FILE_THRESHOLD ? await wholeFile(input) : await scanFile(input);

  const result = {} as FileSystemReadTextRangeResult;
  result.path = request.path;
  Object.assign(result, range);
  result.sizeBytes = info.size;
  result.truncated = false;
  result.startLine = offset + 1;
  result.revision = revisionOf(info);
  return result;
}
