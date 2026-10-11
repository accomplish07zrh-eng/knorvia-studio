// SPDX-License-Identifier: Apache-2.0
// 自定义命令根发现：用户级（knorvia/agents）→ 项目目录链（逐级到 worktree 根）→ 额外根。
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { CustomCommandRoot, CustomCommandSource } from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";

const COMMANDS_DIRECTORY = "commands";
const WORKTREE_MARKER = ".git";
const HOME_PREFIX = "~/";
const PRIORITY_STEP = 10;
const PRIVATE_DIRECTORY = ".knorvia-studio";
const COMPAT_DIRECTORY = ".agents";

export interface CustomCommandRootResolutionOptions {
  extraRoots?: string[];
  extraResolvedRoots?: CustomCommandRoot[];
  homeDirectory?: string;
  includeKnorviaCommands?: boolean;
}

interface RootInput {
  path: string;
  priority: number;
  scope: CustomCommandRoot["scope"];
  source: CustomCommandSource;
}

function makeRoot(input: RootInput): CustomCommandRoot {
  return {
    path: resolve(input.path),
    scope: input.scope,
    source: input.source,
    priority: input.priority,
  };
}

/** 每层两个候选目录：原生 `.knorvia-studio` 先于兼容 `.agents`（同名命令先到先赢）。 */
function baseCandidates(
  baseDirectory: string,
  scope: CustomCommandRoot["scope"],
  nextPriority: () => number,
): CustomCommandRoot[] {
  return [
    makeRoot({
      path: join(baseDirectory, PRIVATE_DIRECTORY, COMMANDS_DIRECTORY),
      priority: nextPriority(),
      scope,
      source: "knorvia",
    }),
    makeRoot({
      path: join(baseDirectory, COMPAT_DIRECTORY, COMMANDS_DIRECTORY),
      priority: nextPriority(),
      scope,
      source: "agents",
    }),
  ];
}

async function hasWorktreeMarker(directory: string): Promise<boolean> {
  return await stat(join(directory, WORKTREE_MARKER)).then(
    () => true,
    () => false,
  );
}

/** 从工作目录向上的目录链；找到 worktree 标记时到该目录（含）为止，否则只含工作目录。 */
async function projectChain(workingDirectory: string): Promise<string[]> {
  const start = resolve(workingDirectory);
  const chain: string[] = [];
  let current = start;
  for (;;) {
    chain.push(current);
    if (await hasWorktreeMarker(current)) return chain;
    const parent = dirname(current);
    if (parent === current) return [start];
    current = parent;
  }
}

function configuredRoot(path: string, workingDirectory: string, home: string): string {
  const expanded = path.startsWith(HOME_PREFIX) ? join(home, path.slice(HOME_PREFIX.length)) : path;
  return isAbsolute(expanded) ? expanded : resolve(workingDirectory, expanded);
}

export async function resolveDefaultCustomCommandRoots(
  workingDirectory: string,
  options: CustomCommandRootResolutionOptions = {},
): Promise<CustomCommandRoot[]> {
  const cwd = resolve(workingDirectory);
  const home = options.homeDirectory ?? homedir();
  const includeNative = options.includeKnorviaCommands ?? true;
  const roots: CustomCommandRoot[] = [];
  let priority = 0;
  const nextPriority = () => {
    priority += PRIORITY_STEP;
    return priority;
  };

  for (const extra of options.extraRoots ?? []) {
    roots.push(
      makeRoot({
        path: configuredRoot(extra, cwd, home),
        priority: nextPriority(),
        scope: "project",
        source: "knorvia",
      }),
    );
  }

  if (includeNative) {
    const privateRoot = options.homeDirectory
      ? join(home, PRIVATE_DIRECTORY)
      : resolveKnorviaDataRoot();
    roots.push(
      makeRoot({
        path: join(privateRoot, COMMANDS_DIRECTORY),
        priority: nextPriority(),
        scope: "user",
        source: "knorvia",
      }),
    );
    roots.push(
      makeRoot({
        path: join(home, COMPAT_DIRECTORY, COMMANDS_DIRECTORY),
        priority: nextPriority(),
        scope: "user",
        source: "agents",
      }),
    );
    for (const directory of await projectChain(cwd)) {
      roots.push(...baseCandidates(directory, "project", nextPriority));
    }
  }

  roots.push(...(options.extraResolvedRoots ?? []));
  return roots;
}
