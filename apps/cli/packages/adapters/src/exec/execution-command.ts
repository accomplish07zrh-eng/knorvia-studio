// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 把 ExecutionCommand 解析成可 spawn 的形态：可执行文件、参数、cwd 方言、shell 选项。
//
// 两条解析路径：
//   - `argv` 模式：直接按文件+参数走；Windows 下要展开 PATHEXT 候选、并对 .cmd/.bat 做转义；
//   - `shell` 模式：按 shellProfile / shell / platform 决定用哪个解释器与方言。
//
// 几个容易被忽略的点：
// 一、**Windows 环境变量大小写不敏感**：删除/设置都要按不区分大小写处理，否则会留下同名残项；
// 二、**`SHELL` 缺失时的兜底是 `/bin/sh`**，不是 `posix` 方言的其它实现；
// 三、**`-l` 只在 `-c` 之前**：登录标志必须落在选项区，放到命令之后就变成参数了；
// 四、**`applyResolvedShellCommand` 替换最后一个 `-c` 之后的命令**，`cmd` 方言则替换末位参数。

import { existsSync } from "node:fs";
import path from "node:path";
import { sanitizeKnorviaRuntimeEnvInPlace } from "@knorvia/shared";
import type {
  ExecutionCommand,
  ExecutionEnvOverlay,
  ExecutionShellDialect,
} from "@knorvia/contracts";
import { applyNetworkEgressEnv, type NetworkEgressEnvPolicy } from "../network/subprocess-env.js";
import { applyExecutionTextEnv } from "./outputEncoding.js";
import { getWindowsEnvValue, windowsExecutableCandidates } from "./windows-executable.js";

/** 解析结果的必填三项：可执行文件、参数、cwd 方言。 */
type SpawnCore = { file: string; args: string[]; cwdDialect: ExecutionShellDialect };

/** 解析结果的 shell 相关项。 */
type SpawnShellFlag = { shell: boolean | string };

/** 解析结果的环境与登录标志。 */
type SpawnExtras = { envOverlay?: Record<string, string>; usesLoginShell?: boolean };

/** 解析结果：spawn 所需的全部要素。 */
export type ResolvedSpawnCommand = SpawnCore & SpawnShellFlag & SpawnExtras;

/** 环境构造的可选项：网络策略与来源环境。 */
type EnvBuildAsk = {
  network?: NetworkEgressEnvPolicy;
  processEnv?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

/** argv 解析所需的上下文。 */
type ArgvAsk = {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  exists: (path: string) => boolean;
  platform: NodeJS.Platform;
};

/** shell 解析所需的上下文。 */
type ShellAsk = {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  resolvedShell?: ResolvedSpawnCommand;
};

/** 入口的解析上下文：进程相关（env/platform/exists）。 */
type ResolveProcAsk = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
};

/** 入口的可选参数：解析上下文 + 目录与已解析 shell。 */
type ResolveAsk = ResolveProcAsk & { cwd?: string; resolvedShell?: ResolvedSpawnCommand };

/** 两个前缀：`mode: "argv"` 与 `mode: "shell"` 的具体形态。 */
type ArgvCommand = Extract<ExecutionCommand, { mode: "argv" }>;
type ShellCommand = Extract<ExecutionCommand, { mode: "shell" }>;

/** 各处的「不启用 shell」常量，避免散落。 */
const NO_SHELL = false;

/** 组装一个解析结果：把必填四项与可选的登录标志分开传。 */
function spawnCommand(
  file: string,
  args: string[],
  cwdDialect: ExecutionShellDialect,
  usesLoginShell?: boolean,
): ResolvedSpawnCommand {
  const result: ResolvedSpawnCommand = { file, args, cwdDialect, shell: NO_SHELL };
  if (usesLoginShell !== undefined) result.usesLoginShell = usesLoginShell;
  return result;
}

/** 环境变量操作的目标：环境对象、键、平台。 */
type EnvKeyTarget = { env: NodeJS.ProcessEnv; key: string; platform: NodeJS.Platform };

/**
 * 移除一个键。
 *
 * Windows 的环境变量名大小写不敏感，所以要清掉所有大小写变体；其它平台只删精确名。
 */
function dropEnvKey(target: EnvKeyTarget): void {
  const { env, key, platform } = target;
  if (platform !== "win32") {
    delete env[key];
    return;
  }

  const wanted = key.toLowerCase();
  for (const candidate of Object.keys(env)) {
    if (candidate.toLowerCase() === wanted) delete env[candidate];
  }
}

/** 写入一个键：先按平台语义清掉同名（含大小写变体），再赋值，避免重复项。 */
function putEnvKey(target: EnvKeyTarget & { value: string }): void {
  dropEnvKey(target);
  target.env[target.key] = target.value;
}

/**
 * 构造执行环境：以来源环境（或空对象）为底，依次叠加四层。
 *
 * 顺序固定：清洗运行时变量 → 文本编码 → 网络出口策略 → overlay 的 unset/set。
 * overlay 的 `base: "empty"` 表示不继承来源环境。
 */
export function buildExecutionEnv(
  overlay?: ExecutionEnvOverlay,
  options: EnvBuildAsk = {},
): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  const source = options.processEnv ?? process.env;
  const inherited = overlay?.base === "empty" ? {} : { ...source };

  sanitizeKnorviaRuntimeEnvInPlace(inherited);
  applyExecutionTextEnv({ env: inherited as Record<string, string>, platform });

  const egressed = applyNetworkEgressEnv(inherited as Record<string, string>, {
    network: options.network,
    platform,
    sourceEnv: source,
    toolEnvPassthrough: overlay?.base !== "empty",
  });

  for (const key of overlay?.unset ?? []) dropEnvKey({ env: egressed, key, platform });
  for (const [key, value] of Object.entries(overlay?.set ?? {})) {
    putEnvKey({ env: egressed, key, value, platform });
  }
  return egressed;
}

/** 给 cmd 参数加引号：只在必要时加，且要正确转义反斜杠与引号。 */
function quoteCmdArgument(value: string): string {
  const needsQuote = value === "" || /[\s"&|<>^()%!]/.test(value);
  if (!needsQuote) return value;
  const escaped = value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1");
  return `"${escaped}"`;
}

/** 用 cmd.exe 执行整条命令行。 */
function resolvedCmd(command: string, env: NodeJS.ProcessEnv): ResolvedSpawnCommand {
  return spawnCommand(
    getWindowsEnvValue(env, "ComSpec") || "cmd.exe",
    ["/d", "/s", "/c", command],
    "cmd",
  );
}

/** argv 模式：非 Windows 直接透传；Windows 要展开候选并对批处理转义。 */
function resolveArgv(command: ArgvCommand, options: ArgvAsk): ResolvedSpawnCommand {
  const args = [...(command.args ?? [])];
  if (options.platform !== "win32") return spawnCommand(command.file, args, "posix");

  const candidates = windowsExecutableCandidates(command.file, options.env, options.cwd);
  const file = candidates.find(options.exists) ?? command.file;
  const extension = path.win32.extname(file).toLowerCase();

  if (extension === ".cmd" || extension === ".bat") {
    const line = [file, ...args].map(quoteCmdArgument).join(" ");
    return resolvedCmd(line, options.env);
  }
  return spawnCommand(file, args, "cmd");
}

/** shell 模式：已解析的 shell 优先，其次显式 shell，最后按平台兜底。 */
function resolveShell(command: ShellCommand, options: ShellAsk): ResolvedSpawnCommand {
  if (command.shellProfile === "posix-bash" && options.resolvedShell !== undefined) {
    return applyResolvedShellCommand(options.resolvedShell, command.command);
  }

  const explicit = command.shell;
  const windows = options.platform === "win32";
  if (windows && (explicit === true || explicit === undefined)) {
    return resolvedCmd(command.command, options.env);
  }

  if (typeof explicit === "string") {
    const basename = (windows ? path.win32 : path.posix).basename(explicit).toLowerCase();
    if (windows && (basename === "cmd" || basename === "cmd.exe")) {
      return resolvedCmd(command.command, { ...options.env, ComSpec: explicit });
    }
    return spawnCommand(explicit, ["-c", command.command], windows ? "git-bash" : "posix");
  }

  return spawnCommand(options.env.SHELL || "/bin/sh", ["-c", command.command], "posix");
}

/** 解析入口：按 mode 分派到 argv 或 shell 路径。 */
export function resolveExecutionCommand(
  command: ExecutionCommand,
  options: ResolveAsk = {},
): ResolvedSpawnCommand {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (command.mode === "argv") {
    return resolveArgv(command, {
      cwd: options.cwd,
      env,
      exists: options.exists ?? existsSync,
      platform,
    });
  }
  return resolveShell(command, { env, platform, resolvedShell: options.resolvedShell });
}

/**
 * 把参数切成「选项区」与「命令区」：命令区从第一个 `-c` 开始（含 `-c` 本身）。
 *
 * 返回 `commandIndex < 0` 表示没有 `-c`，此时整条参数都是选项区。
 */
function splitAtCommandFlag(args: string[]): { options: string[]; tail: string[] } {
  const commandIndex = args.indexOf("-c");
  if (commandIndex < 0) return { options: [...args], tail: [] };
  return { options: args.slice(0, commandIndex), tail: args.slice(commandIndex) };
}

/**
 * 设置/取消登录 shell 模式。
 *
 * `-l` 只能出现在选项区（第一个 `-c` 之前）；cmd 方言没有登录 shell 概念，直接置 false。
 * 先移除已有的 `-l` 再按需插到最前面，保证幂等。
 */
export function setResolvedShellLoginMode(
  resolved: ResolvedSpawnCommand,
  useLoginShell: boolean,
): ResolvedSpawnCommand {
  if (resolved.cwdDialect === "cmd") return { ...resolved, usesLoginShell: false };

  const { options, tail } = splitAtCommandFlag(resolved.args);
  const flags = options.filter((argument) => argument !== "-l");
  if (useLoginShell) flags.unshift("-l");

  return { ...resolved, args: [...flags, ...tail], usesLoginShell: useLoginShell };
}

/**
 * 把解析结果里的「执行哪条命令」替换成新的 command。
 *
 * 三种形态：有 `-c` 就替换它后面那一位；cmd 方言替换末位参数；其余追加 `-c command`。
 */
export function applyResolvedShellCommand(
  resolved: ResolvedSpawnCommand,
  command: string,
): ResolvedSpawnCommand {
  const args = [...resolved.args];
  const commandIndex = args.lastIndexOf("-c");

  if (commandIndex >= 0) args.splice(commandIndex + 1, 1, command);
  else if (resolved.cwdDialect === "cmd") args[args.length - 1] = command;
  else args.push("-c", command);

  return { ...resolved, args };
}

export const applyResolvedShellCommandForTest = applyResolvedShellCommand;

/** 平台的默认 cwd 方言：win32 用 cmd，其余用 posix。 */
export function defaultCwdDialect(platform: NodeJS.Platform): ExecutionShellDialect {
  return platform === "win32" ? "cmd" : "posix";
}
