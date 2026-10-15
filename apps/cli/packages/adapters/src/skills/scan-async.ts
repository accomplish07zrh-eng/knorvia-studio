// SPDX-License-Identifier: Apache-2.0
// 异步技能目录扫描：根必须是目录，根下 SKILL.md 与通过过滤的一级子目录里的 SKILL.md。
import { lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { SKILL_FILE_NAME, shouldWalkSkillDirectoryEntry } from "@knorvia/shared";

/** fs/promises 没有 throwIfNoEntry，这里把 ENOENT 归一成 undefined。 */
function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

async function statusOf(path: string) {
  return await stat(path).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
}

async function isSymlink(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => undefined);
  return info?.isSymbolicLink() ?? false;
}

async function loadableSkillFile(target: string, dereference: boolean): Promise<boolean> {
  if (!dereference && (await isSymlink(target))) return false;
  return (await statusOf(target))?.isFile() ?? false;
}

async function skillFilesIn(directory: string, dereference: boolean): Promise<string[]> {
  const target = join(directory, SKILL_FILE_NAME);
  return (await loadableSkillFile(target, dereference)) ? [target] : [];
}

export async function collectSkillFiles(rootPath: string, dereference: boolean): Promise<string[]> {
  if (!dereference && (await isSymlink(rootPath))) return [];
  const rootInfo = await statusOf(rootPath);
  if (!rootInfo?.isDirectory()) return [];

  const collected = await skillFilesIn(rootPath, dereference);
  for (const entry of await readdir(rootPath, { withFileTypes: true })) {
    const descendable = entry.isDirectory() || (dereference && entry.isSymbolicLink());
    if (!descendable || !shouldWalkSkillDirectoryEntry(entry.name)) continue;
    collected.push(...(await skillFilesIn(join(rootPath, entry.name), dereference)));
  }
  return collected;
}
