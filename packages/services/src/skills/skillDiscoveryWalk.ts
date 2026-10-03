import { readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  MAX_SKILL_SCAN_DEPTH,
  SKILL_FILE_NAME,
  shouldWalkSkillDirectoryEntry,
} from "@knorvia/shared";

export {
  MAX_SKILL_SCAN_DEPTH,
  SKILL_FILE_NAME,
  SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES,
  shouldWalkSkillDirectoryEntry,
} from "@knorvia/shared";

export async function* walkSkillMarkdownPaths(
  rootPath: string,
  options: { onError?: (path: string, error: unknown) => void } = {},
): AsyncGenerator<string> {
  const pending = [{ dir: rootPath, depth: 0 }];
  const symlinkTargets = new Set<string>();
  while (pending.length) {
    const next = pending.pop();
    if (!next) break;
    let entries;
    try {
      entries = await readdir(next.dir, { withFileTypes: true });
    } catch (error) {
      options.onError?.(next.dir, error);
      continue;
    }
    let hasDefinition = false;
    const directories: string[] = [];
    const links: string[] = [];
    for (const entry of entries) {
      if (entry.name === SKILL_FILE_NAME && !entry.isDirectory()) {
        hasDefinition = true;
        continue;
      }
      if (!shouldWalkSkillDirectoryEntry(entry.name)) continue;
      if (entry.isDirectory()) directories.push(join(next.dir, entry.name));
      else if (entry.isSymbolicLink()) links.push(join(next.dir, entry.name));
    }
    if (hasDefinition) yield join(next.dir, SKILL_FILE_NAME);
    if (next.depth >= MAX_SKILL_SCAN_DEPTH) continue;
    for (const dir of directories) pending.push({ dir, depth: next.depth + 1 });
    for (const link of links) {
      let target;
      try {
        target = await stat(link);
      } catch (error) {
        options.onError?.(link, error);
        continue;
      }
      if (!target.isDirectory()) continue;
      const canonical = await realpath(link).catch(() => link);
      if (symlinkTargets.has(canonical)) continue;
      symlinkTargets.add(canonical);
      pending.push({ dir: link, depth: next.depth + 1 });
    }
  }
}
