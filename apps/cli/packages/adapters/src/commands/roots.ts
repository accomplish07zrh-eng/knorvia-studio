// SPDX-License-Identifier: Apache-2.0
// 自定义命令根发现：先额外根，再用户级两个根，最后项目目录链的两类候选，末尾追加显式根。
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { CustomCommandRoot, CustomCommandSource } from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";

const COMMANDS_DIRECTORY = "commands";
const WORKTREE_MARKER = ".git";
const HOME_MARKER = "~/";
const PRIORITY_GAP = 10;
const PRIVATE_DIRECTORY = ".knorvia-studio";
const COMPAT_DIRECTORY = ".agents";

/** 目录名与来源的固定配对；顺序即扫描顺序。 */
const LEVEL_SOURCES: readonly (readonly [string, CustomCommandSource])[] = [
  [PRIVATE_DIRECTORY, "knorvia"],
  [COMPAT_DIRECTORY, "agents"],
];

export interface CustomCommandRootResolutionOptions {
  extraRoots?: string[];
  extraResolvedRoots?: CustomCommandRoot[];
  homeDirectory?: string;
  includeKnorviaCommands?: boolean;
}

type RootScope = CustomCommandRoot["scope"];

interface RootSpec {
  path: string;
  priority: number;
  scope: RootScope;
  source: CustomCommandSource;
}

function buildRoot(spec: RootSpec): CustomCommandRoot {
  const entry = {} as CustomCommandRoot;
  entry.path = resolve(spec.path);
  entry.scope = spec.scope;
  entry.source = spec.source;
  entry.priority = spec.priority;
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

/** 给定基目录，按固定配对产出该类作用域的根（原生目录在前）。 */
function scopedRoots(
  baseDirectory: string,
  scope: RootScope,
  issue: () => number,
): CustomCommandRoot[] {
  const produced: CustomCommandRoot[] = [];
  for (const [directoryName, source] of LEVEL_SOURCES) {
    produced.push(
      buildRoot({
        path: join(baseDirectory, directoryName, COMMANDS_DIRECTORY),
        priority: issue(),
        scope,
        source,
      }),
    );
  }
  return produced;
}

/** `~/` 先展开成用户目录，仍是相对路径时再按工作目录解析。 */
function toAbsolutePath(configured: string, workingDirectory: string, home: string): string {
  const withoutHome = configured.startsWith(HOME_MARKER)
    ? configured.slice(HOME_MARKER.length)
    : undefined;
  const expanded = withoutHome === undefined ? configured : join(home, withoutHome);
  if (isAbsolute(expanded)) return expanded;
  return resolve(workingDirectory, expanded);
}

function userScopeRoots(
  home: string,
  privateRoot: string,
  issue: () => number,
): CustomCommandRoot[] {
  return [
    buildRoot({
      path: join(privateRoot, COMMANDS_DIRECTORY),
      priority: issue(),
      scope: "user",
      source: "knorvia",
    }),
    buildRoot({
      path: join(home, COMPAT_DIRECTORY, COMMANDS_DIRECTORY),
      priority: issue(),
      scope: "user",
      source: "agents",
    }),
  ];
}

export async function resolveDefaultCustomCommandRoots(
  workingDirectory: string,
  options: CustomCommandRootResolutionOptions = {},
): Promise<CustomCommandRoot[]> {
  const cwd = resolve(workingDirectory);
  const homeDirectory = options.homeDirectory ?? homedir();
  const includeNative = options.includeKnorviaCommands ?? true;
  const issue = priorityIssuer(PRIORITY_GAP);
  const collected: CustomCommandRoot[] = [];

  for (const extra of options.extraRoots ?? []) {
    collected.push(
      buildRoot({
        path: toAbsolutePath(extra, cwd, homeDirectory),
        priority: issue(),
        scope: "project",
        source: "knorvia",
      }),
    );
  }

  if (includeNative) {
    const privateRoot = options.homeDirectory
      ? join(homeDirectory, PRIVATE_DIRECTORY)
      : resolveKnorviaDataRoot();
    collected.push(...userScopeRoots(homeDirectory, privateRoot, issue));
    for await (const level of upwardLevels(cwd)) {
      collected.push(...scopedRoots(level, "project", issue));
    }
  }

  collected.push(...(options.extraResolvedRoots ?? []));
  return collected;
}
