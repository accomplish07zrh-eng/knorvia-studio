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

export const TYPE_EXTENSIONS: Record<string, string[]> = Object.fromEntries(
  TYPE_SPEC.split(" ").map((entry) => {
    const [name, extensions] = entry.split(":");
    return [name, (extensions ?? "").split(",")];
  }),
);

export interface Candidate {
  path: string;
  mtimeMs: number;
}

type FileInfo = Awaited<ReturnType<typeof stat>>;

const POSIX_SEPARATOR = "/";

/** 相对路径统一成 POSIX 分隔符：glob 与结果展示都按 `/` 判定。 */
export function posixRelative(root: string, file: string): string {
  return relative(root, file).split(sep).join(POSIX_SEPARATOR);
}

/** 类型名归一：去掉前导点并小写。 */
export function fileType(type: string): string {
  const lowered = type.toLowerCase();
  return lowered.startsWith(".") ? lowered.slice(1) : lowered;
}

export function matchesType(path: string, type: string): boolean {
  const wanted = fileType(type);
  const extension = extname(path).toLowerCase();
  return (TYPE_EXTENSIONS[wanted] ?? ["." + wanted]).includes(extension);
}

/** 过滤闭包：glob 与类型两条规则同时满足才保留。 */
export function filter(
  root: string,
  request: FileSystemSearchTextRequest,
): (path: string) => boolean {
  const matchGlob = request.glob ? glob(request.glob) : undefined;
  const typeFilter = request.type;
  return (path) =>
    (!matchGlob || matchGlob(posixRelative(root, path), basename(path))) &&
    (!typeFilter || matchesType(path, typeFilter));
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
export function recent(a: Candidate, b: Candidate): number {
  const delta = b.mtimeMs - a.mtimeMs;
  return delta === 0 ? a.path.localeCompare(b.path) : delta;
}
