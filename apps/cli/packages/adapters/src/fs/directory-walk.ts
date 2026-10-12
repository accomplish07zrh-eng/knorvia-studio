// SPDX-License-Identifier: Apache-2.0
// 目录遍历：显式目录帧的 DFS，保持 readdir/stat 次序，VCS 目录整棵跳过。
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { aborted } from "./node-file-policy.js";

const VCS_DIRECTORIES = new Set<string>(".git .svn .hg .bzr .jj .sl".split(" "));

type Dirents = Awaited<ReturnType<typeof readdir>>;
type FileInfo = Awaited<ReturnType<typeof stat>>;

interface DirectoryFrame {
  cursor: number;
  entries: Dirents;
  path: string;
}

/**
 * 深度优先遍历：帧里保存「目录 + 已消费游标」，因此不需要把遍历状态放进递归闭包，
 * 也能在每个条目边界检查取消信号。
 */
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
