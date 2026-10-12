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

/** 当前帧：栈顶就是「正在消费的目录」。 */
function currentFrame(pending: DirectoryFrame[]): DirectoryFrame {
  return pending[pending.length - 1]!;
}

/** 进入子目录：新帧从游标 0 开始，entries 由调用方读好。 */
function childFrame(parent: DirectoryFrame, name: string, entries: Dirents): DirectoryFrame {
  const frame = {} as DirectoryFrame;
  frame.cursor = 0;
  frame.entries = entries;
  frame.path = join(parent.path, name);
  return frame;
}

/** VCS 目录整棵跳过；普通目录继续下钻。 */
function isSkippedDirectory(dirent: { isDirectory(): boolean; name: string }): boolean {
  return dirent.isDirectory() && VCS_DIRECTORIES.has(dirent.name);
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
  const rootFrame = {} as DirectoryFrame;
  rootFrame.cursor = 0;
  rootFrame.entries = await readdir(root, { withFileTypes: true });
  rootFrame.path = root;
  const pending: DirectoryFrame[] = [rootFrame];

  while (pending.length > 0) {
    const frame = currentFrame(pending);
    const dirent = frame.entries[frame.cursor];
    if (dirent === undefined) {
      pending.pop();
      continue;
    }
    frame.cursor += 1;
    aborted(signal);
    if (isSkippedDirectory(dirent)) continue;
    if (dirent.isDirectory()) {
      const entries = await readdir(join(frame.path, dirent.name), { withFileTypes: true });
      pending.push(childFrame(frame, dirent.name, entries));
      continue;
    }
    if (dirent.isFile()) {
      const absolute = join(frame.path, dirent.name);
      await visit(absolute, await stat(absolute));
    }
  }
}
