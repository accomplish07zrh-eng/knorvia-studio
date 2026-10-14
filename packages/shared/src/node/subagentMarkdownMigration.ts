// SPDX-License-Identifier: Apache-2.0
// 子代理状态/Markdown 的迁移：把旧格式文件就地改写成当前格式，且保证幂等与并发安全。
//
// 两个入口：
//   * migrateSubagentStateFile —— 迁移一个 JSON 状态文件（旧写 → 新读 → 新写 → 旧读）；
//   * migrateUserSubagentMarkdown —— 递归扫描用户目录，迁移其中 frontmatter 指向旧模型的
//     markdown 文件，返回「实际被改写」的清单与失败清单。
//
// 改写一律走 withFileLock（同路径进程内串行 + 跨进程互斥），并在锁内复核「文件在改写期间
// 没被别人动过」（inode/dev/目录真实路径/内容任一变化即中止），临时文件成败都清理。
import { randomUUID } from "node:crypto";

import { chmod, lstat, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";

import { basename, dirname, join } from "node:path";

import { migrateSubagentMarkdownProvider } from "../subagent-markdown-selection.js";

import { importSubagentStateSelections } from "../subagent-state-migration.js";

import { withFileLock } from "./privateFilePersistence.js";

// 一条失败记录：出事的路径 + 原样抛上来的错误；怎么展示由调用方决定，这里只负责收集。
type SweepFailure = { path: string; error: unknown };

interface MarkdownSweepResult {
  migrated: /* 真的被改写过的文件路径 */ string[];
  failures: SweepFailure[];
}

// 复核「文件在改写期间没被别人动过」：inode、设备号、所在目录的真实路径、文件当前内容，
// 四项有一项对不上就说明有别人在动它，立刻放弃改写让调用方收失败。
const verifyUntouched = async (
  target: string,
  folder: string,
  physicalFolder: string,
  baseline: Stats,
  before: string,
): Promise<boolean> => {
  const current = await lstat(target);
  if (!current.isFile()) return false;
  if (current.ino !== baseline.ino || current.dev !== baseline.dev) return false;
  if ((await realpath(folder)) !== physicalFolder) return false;
  return (await readFile(target, "utf8")) === before;
};

// 在锁内把一个文本文件按 transform 就地改写；内容没变或文件不可写时安静跳过。
const rewriteUnderLock = async (
  target: string,
  transform: (before: string) => string,
): Promise<boolean> => {
  const entry = await lstat(target);
  if (!entry.isFile()) return false;

  return withFileLock(target, async () => {
    const locked = await lstat(target);
    if (!locked.isFile() || (locked.mode & 0o222) === 0) return false;

    const before = await readFile(target, "utf8");
    const after = transform(before);
    if (after === before) return false;

    const folder = dirname(target);
    const physicalFolder = await realpath(folder);
    const staging = join(folder, "." + basename(target) + "." + randomUUID() + ".tmp");

    try {
      await writeFile(staging, after, { flag: "wx", mode: locked.mode & 0o777 });
      await chmod(staging, locked.mode & 0o777);

      if (!(await verifyUntouched(target, folder, physicalFolder, locked, before))) {
        throw new Error("Subagent file changed during migration");
      }

      await rename(staging, target);
      return true;
    } finally {
      await rm(staging, { force: true });
    }
  });
};

// 迁移一个子代理状态 JSON 文件。需要迁移时把 importSubagentStateSelections 的结果以 2 空格
// 缩进 JSON 写回；变换收敛（结果与原文一致）时不写文件。坏 JSON 与缺文件安静返回。
export const migrateSubagentStateFile = async (target: string): Promise<void> => {
  try {
    await rewriteUnderLock(target, (source) => {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return source;

      const migrated = importSubagentStateSelections(parsed as Record<string, unknown>);
      const rewritten = JSON.stringify(migrated, null, 2);
      const converged = JSON.stringify(migrated) === JSON.stringify(parsed);
      return converged ? source : rewritten;
    });
  } catch (fault) {
    if (fault instanceof SyntaxError || (fault as NodeJS.ErrnoException).code === "ENOENT") return;
    throw fault;
  }
};

const MARKDOWN_EXT = /\.(md|markdown)$/iu;

// 递归扫描 userRoot，把其中内容真的被迁移改写的 markdown 记入 migrated，出错的记入 failures。
export const migrateUserSubagentMarkdown = async (
  userRoot: string,
): Promise<MarkdownSweepResult> => {
  const outcome: MarkdownSweepResult = { migrated: [], failures: [] };

  const walk = async (folder: string): Promise<void> => {
    try {
      const stats = await lstat(folder);
      if (!stats.isDirectory()) return;

      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const located = join(folder, entry.name);
        if (entry.isDirectory()) {
          await walk(located);
        } else if (entry.isFile() && MARKDOWN_EXT.test(entry.name)) {
          try {
            if (await rewriteUnderLock(located, migrateSubagentMarkdownProvider)) {
              outcome.migrated.push(located);
            }
          } catch (fault) {
            outcome.failures.push({ path: located, error: fault });
          }
        }
      }
    } catch (fault) {
      // 根目录缺失按「空结果」处理；其它目录读取错误进 failures 不向外抛。
      if ((fault as NodeJS.ErrnoException).code !== "ENOENT") {
        outcome.failures.push({ path: folder, error: fault });
      }
    }
  };

  await walk(userRoot);
  return outcome;
};
