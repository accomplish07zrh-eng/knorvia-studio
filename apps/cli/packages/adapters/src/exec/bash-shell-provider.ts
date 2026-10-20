// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// bash shell 选择的解析：决定这一条命令交给谁执行。
// 优先级固定为「用户配置 → 平台自动探测 → 遗留兜底」，三档都产出同一形状的选择结果。
// 探测一律走可注入的 exists 检查，测试可以不碰真实文件系统。

import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { ExecutionShellDialect, ExecutionShellSelection } from "@knorvia/contracts";
import { windowsExecutableCandidates } from "./windows-executable.js";

type Probe = (candidate: string) => boolean;
type Dialect = ExecutionShellSelection["dialect"];
type Selection = ExecutionShellSelection;
type Resolution = { selection: Selection; provider?: BashShellProvider };

type ResolveAsk = {
  override?: Selection;
  exists?: Probe;
  platform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
};

/** 交给 spawn 的 shell 设定；shell 为 false 表示不再套一层 shell。 */
export interface BashShellProvider {
  dialect: ExecutionShellDialect;
  shell: boolean | string;
  file: string;
  envOverlay?: Record<string, string>;
}

/** 产物展示名：同一种方言在不同平台上的称呼不完全一样。 */
const DISPLAY_NAMES: Record<Dialect, string> = {
  cmd: "Command Prompt",
  "git-bash": "Git Bash",
  "legacy-shell": "System Shell",
  posix: "Bash",
};

/** 默认探测：win32 只看存在性，其余平台还要求可执行位。 */
const probeOnDisk: Probe = (candidate) => {
  const wanted = process.platform === "win32" ? constants.F_OK : constants.X_OK;
  try {
    accessSync(candidate, wanted);
    return true;
  } catch {
    return false;
  }
};

/** 空串永远不算候选；非空才交给探测器。 */
export function isExecutableCandidate(pathValue: string, exists: Probe = probeOnDisk): boolean {
  return pathValue.trim().length > 0 && exists(pathValue);
}

/** posix 方言下再细分 zsh 与 bash 的展示名。 */
function posixDisplayName(file: string): string {
  return path.posix.basename(file).toLowerCase().includes("zsh") ? "Zsh" : DISPLAY_NAMES.posix;
}

function displayNameFor(file: string, dialect: Dialect): string {
  return dialect === "posix" ? posixDisplayName(file) : DISPLAY_NAMES[dialect];
}

function makeSelection(
  file: string | undefined,
  dialect: Dialect,
  source: Selection["source"],
): Selection {
  return {
    path: file,
    dialect,
    source,
    display: { name: displayNameFor(file || "shell", dialect) },
  };
}

/** 把选择结果翻成 spawn 设定；没有路径或属于遗留兜底时不提供 provider。 */
function providerFor(value: Selection): BashShellProvider | undefined {
  const file = value.path;
  if (!file || value.dialect === "legacy-shell") return undefined;
  const provider: BashShellProvider = { dialect: value.dialect, file, shell: false };
  if (value.dialect !== "cmd") {
    provider.envOverlay = { SHELL: file, GIT_EDITOR: "true" };
  }
  return provider;
}

/** 用户配置档：路径为空或不可执行都退回「只有选择、没有 provider」。 */
function fromRecorded(value: Selection, exists: Probe): Resolution {
  if (!value.path) return { selection: value };
  const bareCmd = value.dialect === "cmd" && value.path.toLowerCase() === "cmd.exe";
  if (!bareCmd && !isExecutableCandidate(value.path, exists)) return { selection: value };
  return { selection: value, provider: providerFor(value) };
}

/** PATH 里的目录逐个拼上要给的名字。 */
function fromPathDirectories(names: readonly string[], env: NodeJS.ProcessEnv): string[] {
  const directories = (env.PATH ?? env.Path ?? "").split(":").filter(Boolean);
  const joined: string[] = [];
  for (const directory of directories) {
    for (const name of names) joined.push(path.posix.join(directory, name));
  }
  return joined;
}

/** win32 上 Git 安装位置的常见排布。 */
function gitBashCandidatesUnder(root: string): string[] {
  return [
    "Git/bin/bash.exe",
    "Git/usr/bin/bash.exe",
    "Programs/Git/bin/bash.exe",
    "Programs/Git/usr/bin/bash.exe",
  ].map((suffix) => path.win32.join(root, ...suffix.split("/")));
}

/** 从 PATH 里的 git 反推同目录树下的 bash。 */
function gitBashCandidatesFromPath(env: NodeJS.ProcessEnv, exists: Probe): string[] {
  const found: string[] = [];
  for (const git of windowsExecutableCandidates("git", env)) {
    if (!exists(git)) continue;
    found.push(path.win32.resolve(path.win32.dirname(git), "..", "bin", "bash.exe"));
  }
  return found;
}

function firstExecutable(candidates: readonly string[], exists: Probe): string | undefined {
  for (const candidate of candidates) {
    if (isExecutableCandidate(candidate, exists)) return candidate;
  }
  return undefined;
}

/** win32：先是 Git Bash，其次才是 cmd 兜底。 */
function resolveWindows(env: NodeJS.ProcessEnv, exists: Probe, override?: Selection): Resolution {
  const recorded = override?.source === "user-config" ? override : undefined;
  if (recorded?.path) {
    const basename = path.win32.basename(recorded.path).toLowerCase();
    const accepted =
      recorded.dialect === "git-bash" || recorded.dialect === "cmd" || basename === "cmd.exe";
    if (accepted) return fromRecorded(recorded, exists);
  }
  const installRoots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
    (value): value is string => Boolean(value),
  );
  const candidates = [
    ...installRoots.flatMap(gitBashCandidatesUnder),
    ...gitBashCandidatesFromPath(env, exists),
  ];
  const bash = firstExecutable([...new Set(candidates)], exists);
  if (bash) {
    const chosen = makeSelection(bash, "git-bash", "auto-detected");
    return { selection: chosen, provider: providerFor(chosen) };
  }
  return {
    selection: makeSelection(
      env.ComSpec || env.COMSPEC || "cmd.exe",
      "legacy-shell",
      "legacy-fallback",
    ),
  };
}

/** posix：$SHELL 优先，其次 PATH 里的 zsh/bash，最后常见绝对路径。 */
function resolvePosix(env: NodeJS.ProcessEnv, exists: Probe, override?: Selection): Resolution {
  const recorded = override?.source === "user-config" ? override : undefined;
  if (recorded) return fromRecorded(recorded, exists);
  const preferred = env.SHELL;
  const looksLikeSupported = preferred !== undefined && /(?:^|\/)(?:ba|z)sh$/.test(preferred);
  const candidates = [
    ...(looksLikeSupported ? [preferred] : []),
    ...fromPathDirectories(["zsh", "bash"], env),
    "/bin/zsh",
    "/usr/bin/zsh",
    "/bin/bash",
    "/usr/bin/bash",
  ];
  const shell = firstExecutable([...new Set(candidates)], exists);
  if (shell) {
    const chosen = makeSelection(shell, "posix", "auto-detected");
    return { selection: chosen, provider: providerFor(chosen) };
  }
  return { selection: makeSelection(preferred || "/bin/sh", "legacy-shell", "legacy-fallback") };
}

/**
 * 入口：解析这一条命令该用的 shell。
 * 用户配置优先；用户配置以外的显式选择（例如测试注入）一律按原样回读，不再探测平台。
 */
export function resolveEffectiveBashShellSelection(ask: ResolveAsk): Resolution {
  const exists = ask.exists ?? probeOnDisk;
  const override = ask.override;
  if (override !== undefined && override.source !== "user-config")
    return fromRecorded(override, exists);
  return ask.platform === "win32"
    ? resolveWindows(ask.env, exists, override)
    : resolvePosix(ask.env, exists, override);
}
