// SPDX-License-Identifier: Apache-2.0
// 文件搜索的路径规则：VCS 排除、glob 兼容层、类型扩展名表、DFS 遍历与候选排序。
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { createFileSystemError, type FileSystemSearchTextRequest } from "@knorvia/contracts";
import { aborted } from "./node-file-policy.js";

export const VCS_NAMES = ".git .svn .hg .bzr .jj .sl".split(" ");
const VCS_DIRECTORIES = new Set<string>(VCS_NAMES);

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

type Dirents = Awaited<ReturnType<typeof readdir>>;
type FileInfo = Awaited<ReturnType<typeof stat>>;

/** 相对路径统一成 POSIX 分隔符：glob 与结果展示都按 `/` 判定。 */
export function posixRelative(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

/** 转义 glob 里的正则元字符。 */
function literal(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/** 花括号内容按字面 alternatives 处理，不做递归 glob 展开。 */
function braceGroup(body: string): string {
  const alternatives = body.split(",").map(literal).join("|");
  return "(?:" + alternatives + ")";
}

/** 兼容 glob 的 token scanner：`*`/`**`/`?`/`{a,b}` 之外一律字面量。 */
export function glob(pattern: string): (relativePath: string, fileName: string) => boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = ["^"];
  let at = 0;
  while (at < normalized.length) {
    const char = normalized[at]!;
    if (char === "*") {
      if (normalized[at + 1] !== "*") {
        parts.push("[^/]*");
        at += 1;
        continue;
      }
      const withSlash = normalized[at + 2] === "/";
      parts.push(withSlash ? "(?:.*/)?" : ".*");
      at += withSlash ? 3 : 2;
      continue;
    }
    if (char === "?") {
      parts.push("[^/]");
      at += 1;
      continue;
    }
    if (char === "{") {
      const close = normalized.indexOf("}", at + 1);
      if (close > at) {
        parts.push(braceGroup(normalized.slice(at + 1, close)));
        at = close + 1;
        continue;
      }
    }
    parts.push(literal(char));
    at += 1;
  }
  const regex = new RegExp(parts.join("") + "$");
  return (relativePath, fileName) =>
    regex.test(relativePath) || (!normalized.includes("/") && regex.test(fileName));
}

/** 类型名归一：去掉前导点并小写。 */
export function fileType(type: string): string {
  return type.toLowerCase().replace(/^\./, "");
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
  return (path) =>
    (!matchGlob || matchGlob(posixRelative(root, path), basename(path))) &&
    (!request.type || matchesType(path, request.type));
}

interface DirectoryFrame {
  cursor: number;
  entries: Dirents;
  path: string;
}

/** 显式目录帧保持旧 DFS 的 readdir/stat 次序，不把遍历状态分散在递归闭包。 */
export async function walk(
  root: string,
  signal: AbortSignal | undefined,
  visit: (path: string, info: FileInfo) => Promise<void> | void,
): Promise<void> {
  aborted(signal);
  const frames: DirectoryFrame[] = [
    { cursor: 0, entries: await readdir(root, { withFileTypes: true }), path: root },
  ];
  while (frames.length > 0) {
    const top = frames[frames.length - 1]!;
    if (top.cursor === top.entries.length) {
      frames.pop();
      continue;
    }
    aborted(signal);
    const entry = top.entries[top.cursor++]!;
    const child = join(top.path, entry.name);
    if (entry.isDirectory()) {
      if (VCS_DIRECTORIES.has(entry.name)) continue;
      aborted(signal);
      frames.push({
        cursor: 0,
        entries: await readdir(child, { withFileTypes: true }),
        path: child,
      });
      continue;
    }
    if (entry.isFile()) await visit(child, await stat(child));
  }
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
    result.push({ mtimeMs: Number(candidateInfo.mtimeMs), path: candidatePath });
  };
  if (info.isFile()) {
    collect(path, info);
    return result;
  }
  if (!info.isDirectory()) {
    const message = `Grep search path must be a file or directory: ${path}`;
    throw createFileSystemError({ code: "not_file", message, path });
  }
  await walk(root, signal, collect);
  result.sort((left, right) => left.path.localeCompare(right.path));
  return result;
}

/** 新近度比较器：时间相同时按路径字典序，保证排序稳定。 */
export function recent(a: Candidate, b: Candidate): number {
  const delta = b.mtimeMs - a.mtimeMs;
  return delta === 0 ? a.path.localeCompare(b.path) : delta;
}
