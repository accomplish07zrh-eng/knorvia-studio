import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { createFileSystemError, type FileSystemSearchTextRequest } from "@knorvia/contracts";
import { aborted } from "./node-file-policy.js";
export const VCS_NAMES = [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"] as const;
const vcs = new Set<string>(VCS_NAMES);
export interface Candidate {
  path: string;
  mtimeMs: number;
}
export function posixRelative(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}
function literal(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
/** 兼容 glob 的 token scanner；brace 内容是字面 alternatives，不作递归 glob 展开。 */
export function glob(pattern: string): (relativePath: string, fileName: string) => boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const fragments = ["^"];
  let cursor = 0;
  while (cursor < normalized.length) {
    const ch = normalized[cursor]!;
    if (ch === "*") {
      if (normalized[cursor + 1] !== "*") {
        fragments.push("[^/]*");
        cursor++;
        continue;
      }
      const slash = normalized[cursor + 2] === "/";
      fragments.push(slash ? "(?:.*/)?" : ".*");
      cursor += slash ? 3 : 2;
      continue;
    }
    if (ch === "?") {
      fragments.push("[^/]");
      cursor++;
      continue;
    }
    if (ch === "{") {
      const end = normalized.indexOf("}", cursor + 1);
      if (end > cursor) {
        fragments.push(
          "(?:" +
            normalized
              .slice(cursor + 1, end)
              .split(",")
              .map(literal)
              .join("|") +
            ")",
        );
        cursor = end + 1;
        continue;
      }
    }
    fragments.push(literal(ch));
    cursor++;
  }
  const regex = new RegExp(fragments.join("") + "$");
  return (relativePath, fileName) =>
    regex.test(relativePath) || (!normalized.includes("/") && regex.test(fileName));
}
export const TYPE_EXTENSIONS: Record<string, string[]> = {
  c: [".c", ".h"],
  cpp: [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"],
  csharp: [".cs"],
  css: [".css"],
  go: [".go"],
  html: [".html", ".htm"],
  java: [".java"],
  js: [".js", ".jsx", ".mjs", ".cjs"],
  json: [".json", ".jsonc"],
  markdown: [".md", ".markdown"],
  md: [".md", ".markdown"],
  py: [".py"],
  python: [".py"],
  rs: [".rs"],
  rust: [".rs"],
  sh: [".sh", ".bash", ".zsh"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  tsx: [".tsx"],
  txt: [".txt"],
  yaml: [".yaml", ".yml"],
};
export function fileType(type: string): string {
  return type.toLowerCase().replace(/^\./, "");
}
export function matchesType(path: string, type: string): boolean {
  const normalized = fileType(type),
    extension = extname(path).toLowerCase();
  return (TYPE_EXTENSIONS[normalized] ?? ["." + normalized]).includes(extension);
}
export function filter(
  root: string,
  request: FileSystemSearchTextRequest,
): (path: string) => boolean {
  const match = request.glob ? glob(request.glob) : undefined;
  return (path) =>
    (!match || match(posixRelative(root, path), basename(path))) &&
    (!request.type || matchesType(path, request.type));
}
/** 显式目录帧保持旧 DFS 的 readdir/stat 次序，不把遍历状态分散在递归闭包。 */
export async function walk(
  root: string,
  signal: AbortSignal | undefined,
  visit: (path: string, info: Awaited<ReturnType<typeof stat>>) => Promise<void> | void,
): Promise<void> {
  aborted(signal);
  const stack = [{ path: root, entries: await readdir(root, { withFileTypes: true }), cursor: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    if (frame.cursor === frame.entries.length) {
      stack.pop();
      continue;
    }
    aborted(signal);
    const entry = frame.entries[frame.cursor++]!,
      child = join(frame.path, entry.name);
    if (entry.isDirectory()) {
      if (vcs.has(entry.name)) continue;
      aborted(signal);
      stack.push({
        path: child,
        entries: await readdir(child, { withFileTypes: true }),
        cursor: 0,
      });
    } else if (entry.isFile()) await visit(child, await stat(child));
  }
}
export async function candidates(
  path: string,
  info: Awaited<ReturnType<typeof stat>>,
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  const root = info.isDirectory() ? path : dirname(path),
    keep = filter(root, request),
    result: Candidate[] = [];
  const add = (path: string, info: Awaited<ReturnType<typeof stat>>) => {
    if (info.isFile() && keep(path)) result.push({ path, mtimeMs: Number(info.mtimeMs) });
  };
  if (info.isFile()) {
    add(path, info);
    return result;
  }
  if (!info.isDirectory())
    throw createFileSystemError({
      code: "not_file",
      path,
      message: `Grep search path must be a file or directory: ${path}`,
    });
  await walk(root, signal, add);
  result.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}
export function recent(a: Candidate, b: Candidate): number {
  const time = b.mtimeMs - a.mtimeMs;
  return time === 0 ? a.path.localeCompare(b.path) : time;
}
