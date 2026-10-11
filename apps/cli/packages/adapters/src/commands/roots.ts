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

type RootScope = CustomCommandRoot["scope"];

interface RootInput {
  path: string;
  priority: number;
  scope: RootScope;
  source: CustomCommandSource;
}

function root(input: RootInput): CustomCommandRoot {
  return {
    path: resolve(input.path),
    scope: input.scope,
    source: input.source,
    priority: input.priority,
  };
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(
    () => true,
    () => false,
  );
}

/** 从工作目录向上的目录链：遇到 worktree 标记即返回（含该层），到文件系统根返回起点。 */
async function* projectLevels(workingDirectory: string): AsyncGenerator<string> {
  const start = resolve(workingDirectory);
  let level = start;
  for (;;) {
    yield level;
    if (await exists(join(level, WORKTREE_MARKER))) return;
    const parent = dirname(level);
    if (parent === level) return;
    level = parent;
  }
}

/** 一层目录的两个候选根：原生 `.knorvia-studio` 先于兼容 `.agents`。 */
function* candidatesForLevel(
  level: string,
  scope: RootScope,
  takePriority: () => number,
): Generator<CustomCommandRoot> {
  yield root({
    path: join(level, PRIVATE_DIRECTORY, COMMANDS_DIRECTORY),
    priority: takePriority(),
    scope,
    source: "knorvia",
  });
  yield root({
    path: join(level, COMPAT_DIRECTORY, COMMANDS_DIRECTORY),
    priority: takePriority(),
    scope,
    source: "agents",
  });
}

/** `~/` 展开用给定 home；相对路径按工作目录解析。 */
function resolveConfigured(path: string, workingDirectory: string, home: string): string {
  const expanded = path.startsWith(HOME_PREFIX) ? join(home, path.slice(HOME_PREFIX.length)) : path;
  return isAbsolute(expanded) ? expanded : resolve(workingDirectory, expanded);
}

function userLevelRoots(
  home: string,
  privateRoot: string,
  takePriority: () => number,
): CustomCommandRoot[] {
  return [
    root({
      path: join(privateRoot, COMMANDS_DIRECTORY),
      priority: takePriority(),
      scope: "user",
      source: "knorvia",
    }),
    root({
      path: join(home, COMPAT_DIRECTORY, COMMANDS_DIRECTORY),
      priority: takePriority(),
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
  const home = options.homeDirectory ?? homedir();
  const includeNative = options.includeKnorviaCommands ?? true;
  const roots: CustomCommandRoot[] = [];
  let priority = 0;
  const takePriority = () => {
    priority += PRIORITY_STEP;
    return priority;
  };

  for (const extra of options.extraRoots ?? []) {
    roots.push(
      root({
        path: resolveConfigured(extra, cwd, home),
        priority: takePriority(),
        scope: "project",
        source: "knorvia",
      }),
    );
  }

  if (includeNative) {
    const privateRoot = options.homeDirectory
      ? join(home, PRIVATE_DIRECTORY)
      : resolveKnorviaDataRoot();
    roots.push(...userLevelRoots(home, privateRoot, takePriority));
    for await (const level of projectLevels(cwd)) {
      for (const candidate of candidatesForLevel(level, "project", takePriority))
        roots.push(candidate);
    }
  }

  roots.push(...(options.extraResolvedRoots ?? []));
  return roots;
}
