// SPDX-License-Identifier: Apache-2.0
// 记忆召回清单：扫一遍记忆目录，取每个主题文件 front matter 里的 description/type 与修改时间，
// 按最新在前排序后截断。文件系统一律经注入的 FileSystemPort，模块本身不做真实 IO。
import { basename, relative, sep } from "node:path";
import type { FileSystemPort } from "@knorvia/contracts";
import { parse as parseYaml } from "yaml";
import { MEMORY_RECALL_TYPES, type MemoryManifestEntry, type MemoryRecallType } from "./types.js";

// 预览只读前若干行：够拿 front matter，不把整篇主题文件读进内存。
const PREVIEW_LINE_LIMIT = 30;
// 清单上限：一次召回最多列这么多条，按修改时间取最新的那些。
const MANIFEST_ENTRY_LIMIT = 200;
const FRONT_MATTER_FENCE = "---";
const BYTE_ORDER_MARK = /^\uFEFF/u;
// 具名返回值：解析不出来、不是文件、没有条目，各自一个常量，读起来比裸字面量清楚。
const NO_FRONT_MATTER = undefined;
const NOT_A_FILE = false;
const NO_ENTRIES: MemoryManifestEntry[] = [];

type PreviewAttributes = Pick<MemoryManifestEntry, "description" | "type">;

interface ScanContext {
  fileSystem: FileSystemPort;
  rootDir: string;
  signal?: AbortSignal;
}

// 预览文本切成行：先去 BOM，再把 CRLF 归一成 LF。
function previewLines(content: string): string[] {
  const withoutBom = content.replace(BYTE_ORDER_MARK, "");
  const normalized = withoutBom.replace(/\r\n/gu, "\n");
  return normalized.split("\n");
}

// front matter 解析：坏 YAML、非对象、数组都当作「没有 front matter」。
function parseFrontMatter(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = parseYaml(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NO_FRONT_MATTER;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return NO_FRONT_MATTER;
  }
}

// metadata.type：metadata 是普通对象才取它的 type，否则当作没有。
function metadataType(metadata: unknown): unknown {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return NO_FRONT_MATTER;
  }
  return (metadata as Record<string, unknown>).type;
}

// type 优先取 metadata.type，其次顶层 type；不在召回类型闭集里就不认。
function recallTypeOf(header: Record<string, unknown>): MemoryRecallType | undefined {
  const candidate = metadataType(header.metadata) ?? header.type;
  if (typeof candidate !== "string") return undefined;
  if (!MEMORY_RECALL_TYPES.includes(candidate as MemoryRecallType)) return undefined;
  return candidate as MemoryRecallType;
}

// 取 front matter 里能用的两个字段；没有 front matter 或解析失败就返回空对象。
function previewAttributes(content: string): PreviewAttributes {
  const lines = previewLines(content);
  if (lines[0] !== FRONT_MATTER_FENCE) return {};
  const closingIndex = lines.indexOf(FRONT_MATTER_FENCE, 1);
  if (closingIndex === -1) return {};

  const header = parseFrontMatter(lines.slice(1, closingIndex).join("\n"));
  if (header === undefined) return {};

  const attributes: PreviewAttributes = {};
  const description = header.description;
  if (typeof description === "string" && description.length > 0) {
    attributes.description = description;
  }
  const type = recallTypeOf(header);
  if (type !== undefined) attributes.type = type;
  return attributes;
}

// 主题文件候选：.md 结尾且不是索引本身 MEMORY.md。
function isManifestCandidate(path: string): boolean {
  return path.endsWith(".md") && basename(path) !== "MEMORY.md";
}

// 符号链接只在能解析成普通文件时才算候选（断链不贡献路径）。
async function resolvesToFile(context: ScanContext, path: string): Promise<boolean> {
  try {
    const target = await context.fileSystem.stat({ path }, { signal: context.signal });
    return target.kind === "file";
  } catch {
    return NOT_A_FILE;
  }
}

// 深度优先收集候选路径：目录先递归，再按出现顺序收文件与可解析的符号链接。
async function collectMarkdownPaths(context: ScanContext, directory: string): Promise<string[]> {
  const listing = await context.fileSystem.listDirectory(
    { path: directory },
    { signal: context.signal },
  );
  const found: string[] = [];
  for (const entry of listing.entries) {
    if (entry.kind === "directory") {
      found.push(...(await collectMarkdownPaths(context, entry.path)));
    } else if (isManifestCandidate(entry.path)) {
      if (entry.kind === "file") found.push(entry.path);
      else if (await resolvesToFile(context, entry.path)) found.push(entry.path);
    }
  }
  return found;
}

// 读一条清单项：状态与预览并行取；字段插入顺序与旧实现一致（description 在前、type 在后）。
async function readManifestEntry(
  context: ScanContext,
  filePath: string,
): Promise<MemoryManifestEntry> {
  const [status, preview] = await Promise.all([
    context.fileSystem.stat({ path: filePath }, { signal: context.signal }),
    context.fileSystem.readTextFileRange(
      { path: filePath, offsetLine: 0, limitLines: PREVIEW_LINE_LIMIT },
      { signal: context.signal },
    ),
  ]);
  const attributes = previewAttributes(preview.content);
  const entry: Record<string, unknown> = {};
  if (attributes.description) entry.description = attributes.description;
  entry.filePath = filePath;
  entry.filename = relative(context.rootDir, filePath).split(sep).join("/");
  entry.mtimeMs = status.mtimeMs ?? 0;
  if (attributes.type) entry.type = attributes.type;
  return entry as unknown as MemoryManifestEntry;
}

// 成功读取的条目按修改时间降序，取前 MANIFEST_ENTRY_LIMIT 条。
function toManifest(settled: PromiseSettledResult<MemoryManifestEntry>[]): MemoryManifestEntry[] {
  const manifest: MemoryManifestEntry[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") manifest.push(result.value);
  }
  return manifest
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, MANIFEST_ENTRY_LIMIT);
}

export async function scanMemoryManifest(input: {
  fileSystem: FileSystemPort;
  rootDir: string;
  signal?: AbortSignal;
}): Promise<MemoryManifestEntry[]> {
  const context: ScanContext = input;
  let paths: string[];
  try {
    paths = await collectMarkdownPaths(context, context.rootDir);
  } catch {
    return NO_ENTRIES.slice();
  }
  const settled = await Promise.allSettled(
    paths.map((filePath) => readManifestEntry(context, filePath)),
  );
  return toManifest(settled);
}

export function formatMemoryManifest(manifest: readonly MemoryManifestEntry[]): string {
  return manifest.map(formatManifestRow).join("\n");
}

// 一行清单：`- [type] filename (ISO 时间)`；有描述时以 `: 描述` 结尾。
function formatManifestRow(entry: MemoryManifestEntry): string {
  const typePrefix = entry.type ? `[${entry.type}] ` : "";
  const head = `- ${typePrefix}${entry.filename} (${new Date(entry.mtimeMs).toISOString()})`;
  if (!entry.description) return head;
  return `${head}: ${entry.description}`;
}
