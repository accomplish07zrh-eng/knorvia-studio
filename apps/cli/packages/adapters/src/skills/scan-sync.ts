// SPDX-License-Identifier: Apache-2.0
// 同步技能目录扫描：与异步版本逐条对应，返回顺序一致。
// 用 `throwIfNoEntry: false` 让 ENOENT 直接变成 undefined，避免散落的 try/catch。
import { lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SKILL_FILE_NAME, shouldWalkSkillDirectoryEntry } from "@knorvia/shared";

function infoOf(path: string) {
  return statSync(path, { throwIfNoEntry: false });
}

function symlinkAt(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

function loadableSkillFile(target: string, dereference: boolean): boolean {
  if (!dereference && symlinkAt(target)) return false;
  return infoOf(target)?.isFile() ?? false;
}

function skillFilesIn(directory: string, dereference: boolean): string[] {
  const target = join(directory, SKILL_FILE_NAME);
  return loadableSkillFile(target, dereference) ? [target] : [];
}

export function collectSkillFilesSync(rootPath: string, dereference: boolean): string[] {
  if (!dereference && symlinkAt(rootPath)) return [];
  const rootInfo = infoOf(rootPath);
  if (!rootInfo?.isDirectory()) return [];

  const collected = skillFilesIn(rootPath, dereference);
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const descendable = entry.isDirectory() || (dereference && entry.isSymbolicLink());
    if (!descendable || !shouldWalkSkillDirectoryEntry(entry.name)) continue;
    collected.push(...skillFilesIn(join(rootPath, entry.name), dereference));
  }
  return collected;
}
