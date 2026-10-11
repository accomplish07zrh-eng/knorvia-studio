// SPDX-License-Identifier: Apache-2.0
// 技能根发现：用户级两个根 → 项目目录链 → 额外根；优先级按产出顺序每级 +10。
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { SkillRoot, SkillSource } from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";

const SKILLS_DIRECTORY = "skills";
const WORKTREE_MARKER = ".git";
const HOME_MARKER = "~/";
const PRIORITY_GAP = 10;
const PRIVATE_DIRECTORY = ".knorvia-studio";
const COMPAT_DIRECTORY = ".agents";

/** 目录名与来源的固定配对；顺序即同层扫描顺序。 */
const LEVEL_SOURCES: readonly (readonly [string, SkillSource])[] = [
  [PRIVATE_DIRECTORY, "knorvia"],
  [COMPAT_DIRECTORY, "agents"],
];

export interface SkillRootResolutionOptions {
  homeDirectory?: string;
  extraRoots?: string[];
  extraResolvedRoots?: SkillRoot[];
  includeKnorviaSkills?: boolean;
}

type RootScope = SkillRoot["scope"];

function makeRoot(
  path: string,
  scope: RootScope,
  source: SkillSource,
  priority: number,
): SkillRoot {
  const entry = {} as SkillRoot;
  entry.path = resolve(path);
  entry.scope = scope;
  entry.source = source;
  entry.priority = priority;
  return entry;
}

/** 单调递增的优先级发号器：每取一次前进一个步长（首号为步长本身）。 */
function priorityIssuer(step: number): () => number {
  let issued = 0;
  return () => {
    issued += step;
    return issued;
  };
}

async function markerPresent(directory: string): Promise<boolean> {
  return await stat(join(directory, WORKTREE_MARKER)).then(
    () => true,
    () => false,
  );
}

/** 逐级向上的目录链；遇到 worktree 标记的那一层即为最后一层，否则只产出起点。 */
async function* upwardLevels(workingDirectory: string): AsyncGenerator<string> {
  const start = resolve(workingDirectory);
  let level = start;
  for (;;) {
    yield level;
    if (await markerPresent(level)) return;
    const parent = dirname(level);
    if (parent === level) return;
    level = parent;
  }
}

function levelRoots(level: string, scope: RootScope, issue: () => number): SkillRoot[] {
  const produced: SkillRoot[] = [];
  for (const [directoryName, source] of LEVEL_SOURCES) {
    produced.push(makeRoot(join(level, directoryName, SKILLS_DIRECTORY), scope, source, issue()));
  }
  return produced;
}

/**
 * `~/` 一律展开成**真实**用户目录（技能根的历史行为，不接受 homeDirectory 覆盖）；
 * 其余相对路径按工作目录解析。
 */
function toAbsolutePath(configured: string, workingDirectory: string): string {
  if (configured.startsWith(HOME_MARKER)) {
    const rest = configured.slice(HOME_MARKER.length);
    return rest.length === 0 ? homedir() : join(homedir(), rest);
  }
  return isAbsolute(configured) ? configured : resolve(workingDirectory, configured);
}

function userScopeRoots(
  homeDirectory: string,
  privateRoot: string,
  issue: () => number,
): SkillRoot[] {
  const produced: SkillRoot[] = [];
  for (const [directoryName, source] of LEVEL_SOURCES) {
    const base = source === "knorvia" ? privateRoot : join(homeDirectory, directoryName);
    produced.push(makeRoot(join(base, SKILLS_DIRECTORY), "user", source, issue()));
  }
  return produced;
}

export async function resolveDefaultSkillRoots(
  workingDirectory: string,
  options: SkillRootResolutionOptions = {},
): Promise<SkillRoot[]> {
  const cwd = resolve(workingDirectory);
  const includeNative = options.includeKnorviaSkills ?? true;
  const issue = priorityIssuer(PRIORITY_GAP);
  const collected: SkillRoot[] = [];

  for (const extra of options.extraRoots ?? []) {
    collected.push(makeRoot(toAbsolutePath(extra, cwd), "project", "knorvia", issue()));
  }

  if (includeNative) {
    const privateRoot = options.homeDirectory
      ? join(options.homeDirectory, PRIVATE_DIRECTORY)
      : resolveKnorviaDataRoot();
    collected.push(...userScopeRoots(options.homeDirectory ?? homedir(), privateRoot, issue));
    for await (const level of upwardLevels(cwd)) {
      collected.push(...levelRoots(level, "project", issue));
    }
  }

  collected.push(...(options.extraResolvedRoots ?? []));
  return collected;
}
