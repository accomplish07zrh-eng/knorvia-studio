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
const CANCEL_SCOPE = "file fields read";

type RangeContent = Pick<
  FileSystemReadTextRangeResult,
  "content" | "encoding" | "lineEndings" | "bytesRead" | "lineCount" | "totalLines"
>;

/** 两条读取路径共用的输入：请求 + 已解析的行区间 + 取消信号。 */
interface RangeInput {
  limit: number | undefined;
  offset: number;
  query: RangeRequest;
  signal: AbortSignal | undefined;
}

function abortWith(scope: string): Error {
  return abortError(`File system operation was abortWith: ${scope}`);
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortWith(CANCEL_SCOPE);
}

function displaySize(payload: number): string {
  for (const [unit, suffix] of [
    [MIB, "MB"],
    [KIB, "KB"],
  ] as const) {
    if (payload >= unit) {
      const value = payload / unit;
      const digits = Number.isInteger(value)
        ? String(value)
        : value.toFixed(1).replace(/\.0$/u, "");
      return digits + suffix;
    }
  }
  return String(payload) + "B";
}

type RangeRequest = FileSystemReadTextRangeRequest;

function tooLargeError(query: RangeRequest, size: number): Error {
  const actual = displaySize(size);
  const allowed = displaySize(query.maxBytes ?? 0);
  const message =
    `File content (${actual}) exceeds maximum allowed size (${allowed}). ` + LIMIT_HINT;
  return createFileSystemError({ code: "too_large", message, path: query.path });
}

/** 体积上限提示的固定后缀：B101 断言其文本，逐字保持。 */
const LIMIT_HINT =
  "Use offset and limit parameters to read specific portions of the file, " +
  "or search for specific content instead of reading the whole file.";

/** 行选择：limit 为 undefined 时读到结尾，否则取 offset 起的连续 limit 行。 */
function selectLines(rows: string[], offset: number, limit: number | undefined): string[] {
  if (limit === undefined) return rows.slice(offset);
  return rows.slice(offset, offset + limit);
}

function revisionOf(info: Stats): { id: string; mtimeMs: number; sizeBytes: number } {
  const revision = {} as { id: string; mtimeMs: number; sizeBytes: number };
  revision.id = `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`;
  revision.mtimeMs = info.mtimeMs;
  revision.sizeBytes = info.size;
  return revision;
}

/** 小文件：整块读入后切行，chosen 为最终返回的行集合。 */
async function wholeFile(shared: RangeInput): Promise<RangeContent> {
  const { query, signal } = shared;
  throwIfCancelled(signal);
  const payload = await readFile(query.path);
  throwIfCancelled(signal);
  const { content: decoded, encoding } = decodeTextBuffer({
    buffer: payload,
    encoding: query.encoding,
    path: query.path,
  });
  const normalizes = shouldNormalizeLineEndings(encoding);
  const normalized = normalizes ? normalizeLineEndings(decoded) : decoded;
  const rows = normalized === "" ? [] : normalized.split("\n");
  const chosen = selectLines(rows, shared.offset, shared.limit);
  const content = {} as RangeContent;
  content.content = chosen.join("\n");
  content.encoding = encoding;
  content.lineEndings = normalizes ? detectLineEndings(decoded) : undefined;
  content.bytesRead = payload.length;
  content.lineCount = chosen.length;
  content.totalLines = rows.length;
  return content;
}

/** 大文件：流式解码进 TextLineWindow，只在窗口内保留被选中的行。 */
async function scanFile(shared: RangeInput): Promise<RangeContent> {
  const { query, signal } = shared;
  const encoding = query.encoding ?? (await sampleEncoding(query.path, signal));
  const decoder = createStreamingTextDecoder(encoding);
  const collector = new TextLineWindow(shared.offset, shared.limit);
  const stream = createReadStream(query.path);
  const onAbort = (): void => {
    stream.destroy(abortWith(query.path));
  };
  let consumed = 0;
  let hasBytes = false;
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for await (const piece of stream) {
      throwIfCancelled(signal);
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
  throwIfCancelled(signal);
  const head = await prefix(path, HEAD_CAPACITY);
  return detectTextEncoding(head);
}

export async function readTextFileRangeFromNode(
  request: FileSystemReadTextRangeRequest,
  info: Stats,
  signal?: AbortSignal,
): Promise<FileSystemReadTextRangeResult> {
  throwIfCancelled(signal);
  const maxBytes = request.maxBytes;
  if (maxBytes !== undefined && info.size > maxBytes) throw tooLargeError(request, info.size);

  const offset = Math.max(0, Math.trunc(request.offsetLine ?? 0));
  const limit =
    request.limitLines === undefined ? undefined : Math.max(0, Math.trunc(request.limitLines));
  const shared: RangeInput = { limit, offset, query: request, signal };

  const fields =
    info.size <= WHOLE_FILE_THRESHOLD ? await wholeFile(shared) : await scanFile(shared);

  const result = {} as FileSystemReadTextRangeResult;
  result.path = request.path;
  Object.assign(result, fields);
  result.sizeBytes = info.size;
  result.truncated = false;
  result.startLine = offset + 1;
  result.revision = revisionOf(info);
  return result;
}
