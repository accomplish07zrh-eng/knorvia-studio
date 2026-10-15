// SPDX-License-Identifier: Apache-2.0
// 文件搜索的路径规则：类型扩展名表、glob 过滤、候选收集与排序；遍历见 directory-walk。
import { stat } from "node:fs/promises";
import { basename, dirname, extname, relative, sep } from "node:path";
import { createFileSystemError, type FileSystemSearchTextRequest } from "@knorvia/contracts";
import { walk } from "./directory-walk.js";
import { glob } from "./glob-compat.js";

// 兼容面：`glob` 与 `walk` 的实现分别下沉 glob-compat / directory-walk，导出名不变。
export { glob, walk };

export const VCS_NAMES = ".git .svn .hg .bzr .jj .sl".split(" ");

/** 类型 → 扩展名的紧凑描述：`<类型>:<扩展名,扩展名>`，空格分隔。 */
const TYPE_SPEC =
  "c:.c,.h cpp:.cc,.cpp,.cxx,.hpp,.hh,.hxx csharp:.cs css:.css go:.go html:.html,.htm " +
  "java:.java js:.js,.jsx,.mjs,.cjs json:.json,.jsonc markdown:.md,.markdown md:.md,.markdown " +
  "py:.py python:.py rs:.rs rust:.rs sh:.sh,.bash,.zsh ts:.ts,.tsx,.mts,.cts tsx:.tsx txt:.txt yaml:.yaml,.yml";

/** 解析紧凑描述：每项是 `<类型>:<扩展名,扩展名>`。 */
function parseTypeSpec(spec: string): Record<string, string[]> {
  const table: Record<string, string[]> = {};
  for (const entry of spec.split(" ")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    table[entry.slice(0, separator)] = entry.slice(separator + 1).split(",");
  }
  return table;
}

export const TYPE_EXTENSIONS: Record<string, string[]> = parseTypeSpec(TYPE_SPEC);

export interface Candidate {
  path: string;
  mtimeMs: number;
}

type FileInfo = Awaited<ReturnType<typeof stat>>;

const POSIX_SEPARATOR = "/";

/** 相对路径统一成 POSIX 分隔符：glob 与结果展示都按 `/` 判定。 */
export function posixRelative(from: string, target: string): string {
  const rel = relative(from, target).split(sep);
  return rel.join(POSIX_SEPARATOR);
}

/** 类型名归一：去掉前导点并小写。 */
export function fileType(rawType: string): string {
  const lowered = rawType.toLowerCase();
  return lowered.startsWith(".") ? lowered.slice(1) : lowered;
}

export function matchesType(candidate: string, rawType: string): boolean {
  const wanted = fileType(rawType);
  const extension = extname(candidate).toLowerCase();
  return (TYPE_EXTENSIONS[wanted] ?? ["." + wanted]).includes(extension);
}

/** 过滤闭包：glob 与类型两条规则同时满足才保留。 */
export function filter(
  base: string,
  query: FileSystemSearchTextRequest,
): (path: string) => boolean {
  const globMatcher = query.glob ? glob(query.glob) : undefined;
  const wantedType = query.type;
  return (candidate) =>
    (!globMatcher || globMatcher(posixRelative(base, candidate), basename(candidate))) &&
    (!wantedType || matchesType(candidate, wantedType));
}

function notFileError(path: string): Error {
  const message = `Grep search path must be a file or directory: ${path}`;
  return createFileSystemError({ code: "not_file", message, path });
}

/** 候选文件：文件直接返回，目录按 DFS 收集后按路径字典序排序。 */
export async function candidates(
  path: string,
  info: FileInfo,
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  const root = info.isDirectory() ? path : dirname(path);
  const keep = filter(root, request);
  const result: Candidate[] = [];
  const collect = (candidatePath: string, candidateInfo: FileInfo): void => {
    if (!candidateInfo.isFile() || !keep(candidatePath)) return;
    const entry = {} as Candidate;
    entry.mtimeMs = Number(candidateInfo.mtimeMs);
    entry.path = candidatePath;
    result.push(entry);
  };
  if (info.isFile()) {
    collect(path, info);
    return result;
  }
  if (!info.isDirectory()) throw notFileError(path);
  await walk(root, signal, collect);
  result.sort((left, right) => left.path.localeCompare(right.path));
  return result;
}

/** 新近度比较器：时间相同时按路径字典序，保证排序稳定。 */
export function recent(left: Candidate, right: Candidate): number {
  const delta = right.mtimeMs - left.mtimeMs;
  return delta === 0 ? left.path.localeCompare(right.path) : delta;
}
