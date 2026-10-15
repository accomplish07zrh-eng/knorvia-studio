// SPDX-License-Identifier: Apache-2.0
// 搜索结果的装配与输出辅助：分页裁剪、结果对象构造、ripgrep 文本行/路径归一。
import { isAbsolute, join, normalize } from "node:path";
import type {
  FileSystemSearchTextEntry,
  FileSystemSearchTextRequest,
  FileSystemSearchTextResult,
} from "@knorvia/contracts";
import type { Page, PageInput } from "./text-search-result-types.js";

const DEFAULT_HEAD_LIMIT = 250;
const DOT_SLASH = "./";

export interface FoundHits {
  entries: FileSystemSearchTextEntry[];
  files: string[];
  numMatches: number;
}

/** 分页：headLimit 为 0 表示「不裁剪」但仍应用 offset。 */
export function pageOf<T>(input: PageInput<T>): Page {
  const from = input.request.offset ?? 0;
  const cap = input.request.headLimit ?? DEFAULT_HEAD_LIMIT;
  const overflowed = cap !== 0 && input.items.length - from > cap;
  const page = {} as Page;
  page.items = cap === 0 ? input.items.slice(from) : input.items.slice(from, from + cap);
  page.truncated = overflowed;
  page.appliedLimit = overflowed ? cap : undefined;
  page.appliedOffset = from > 0 ? from : undefined;
  return page;
}

/** 结果装配：按输出模式决定 files/entries 哪一侧携带分页后的条目。 */
export function finishResult(
  options: FileSystemSearchTextRequest,
  beganAt: number,
  found: FoundHits,
): FileSystemSearchTextResult {
  const mode = options.outputMode ?? "files_with_matches";
  const listing = mode === "files_with_matches";
  const page = pageOf({
    items: listing ? found.files : (found.entries as unknown[]),
    request: options,
  });
  const result = {} as FileSystemSearchTextResult;
  result.path = options.path;
  result.pattern = options.pattern.trim();
  result.mode = mode;
  result.durationMs = Math.max(0, Date.now() - beganAt);
  result.files = listing ? (page.items as string[]) : found.files;
  result.entries = listing ? [] : (page.items as FileSystemSearchTextEntry[]);
  result.numMatches = found.numMatches;
  result.truncated = page.truncated;
  result.appliedLimit = page.appliedLimit;
  result.appliedOffset = page.appliedOffset;
  return result;
}

/** 逐行切分：去掉行尾 `\r`，并保留「最后一段为空」的语义。 */
export function outputLines(text: string): string[] {
  const rows = text.split("\n").map((row) => (row.endsWith("\r") ? row.slice(0, -1) : row));
  return rows.filter((row, index) => row.length > 0 || index < rows.length - 1);
}

/** 相对路径按 root 归一，`./` 前缀先剥掉；绝对路径直接 normalize。 */
export function outputPath(root: string, value: string): string {
  const relative = value.startsWith(DOT_SLASH) ? value.slice(DOT_SLASH.length) : value;
  return normalize(isAbsolute(value) ? value : join(root, relative));
}
