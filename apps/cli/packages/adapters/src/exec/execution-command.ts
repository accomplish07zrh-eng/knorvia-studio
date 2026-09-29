// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

export interface ResolvedSpawnCommand {
  args: string[];
  cwdDialect: ExecutionShellDialect;
  envOverlay?: Record<string, string>;
  file: string;
  shell: boolean | string;
  usesLoginShell?: boolean;
}

function deleteEnvKey(env: NodeJS.ProcessEnv, key: string, platform: NodeJS.Platform): void {
  if (platform !== "win32") {
    delete env[key];
    return;
  }
  const wanted = key.toLowerCase();
  for (const candidate of Object.keys(env)) {
    if (candidate.toLowerCase() === wanted) delete env[candidate];
  }
}

function setEnvKey(
  env: NodeJS.ProcessEnv,
  key: string,
  value: string,
  platform: NodeJS.Platform,
): void {
  deleteEnvKey(env, key, platform);
  env[key] = value;
}

export function buildExecutionEnv(
  overlay?: ExecutionEnvOverlay,
  options: {
    network?: NetworkEgressEnvPolicy;
    platform?: NodeJS.Platform;
    processEnv?: NodeJS.ProcessEnv;
  } = {},
): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  const source = options.processEnv ?? process.env;
  let env: NodeJS.ProcessEnv = overlay?.base === "empty" ? {} : { ...source };
  sanitizeKnorviaRuntimeEnvInPlace(env);
  applyExecutionTextEnv(env as Record<string, string>, platform);
  env = applyNetworkEgressEnv(env as Record<string, string>, {
    network: options.network,
    platform,
    sourceEnv: source,
    toolEnvPassthrough: overlay?.base !== "empty",
  });
  for (const key of overlay?.unset ?? []) deleteEnvKey(env, key, platform);
  for (const [key, value] of Object.entries(overlay?.set ?? {}))
    setEnvKey(env, key, value, platform);
  return env;
}

function quoteCmdArgument(value: string): string {
  if (value !== "" && !/[\s"&|<>^()%!]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

function resolvedCmd(command: string, env: NodeJS.ProcessEnv): ResolvedSpawnCommand {
  return {
    file: getWindowsEnvValue(env, "ComSpec") || "cmd.exe",
    args: ["/d", "/s", "/c", command],
    cwdDialect: "cmd",
    shell: false,
  };
}

function resolveArgv(
  command: Extract<ExecutionCommand, { mode: "argv" }>,
  options: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    exists: (path: string) => boolean;
    platform: NodeJS.Platform;
  },
): ResolvedSpawnCommand {
  if (options.platform !== "win32") {
    return {
      file: command.file,
      args: [...(command.args ?? [])],
      cwdDialect: "posix",
      shell: false,
    };
  }
  const candidates = windowsExecutableCandidates(command.file, options.env, options.cwd);
  const file = candidates.find(options.exists) ?? command.file;
  const extension = path.win32.extname(file).toLowerCase();
  if (extension === ".cmd" || extension === ".bat") {
    const line = [file, ...(command.args ?? [])].map(quoteCmdArgument).join(" ");
    return resolvedCmd(line, options.env);
  }
  return { file, args: [...(command.args ?? [])], cwdDialect: "cmd", shell: false };
}

function resolveShell(
  command: Extract<ExecutionCommand, { mode: "shell" }>,
  options: {
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform;
    resolvedShell?: ResolvedSpawnCommand;
  },
): ResolvedSpawnCommand {
  if (command.shellProfile === "posix-bash" && options.resolvedShell) {
    return applyResolvedShellCommand(options.resolvedShell, command.command);
  }
  const explicit = command.shell;
  if (options.platform === "win32" && (explicit === true || explicit === undefined)) {
    return resolvedCmd(command.command, options.env);
  }
  if (typeof explicit === "string") {
    const base = (options.platform === "win32" ? path.win32 : path.posix)
      .basename(explicit)
      .toLowerCase();
    if (options.platform === "win32" && (base === "cmd" || base === "cmd.exe")) {
      return resolvedCmd(command.command, { ...options.env, ComSpec: explicit });
    }
    return {
      file: explicit,
      args: ["-c", command.command],
      cwdDialect: options.platform === "win32" ? "git-bash" : "posix",
      shell: false,
    };
  }
  const file = options.env.SHELL || "/bin/sh";
  return { file, args: ["-c", command.command], cwdDialect: "posix", shell: false };
}

export function resolveExecutionCommand(
  command: ExecutionCommand,
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    exists?: (path: string) => boolean;
    platform?: NodeJS.Platform;
    resolvedShell?: ResolvedSpawnCommand;
  } = {},
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

export function setResolvedShellLoginMode(
  resolved: ResolvedSpawnCommand,
  useLoginShell: boolean,
): ResolvedSpawnCommand {
  if (resolved.cwdDialect === "cmd") return { ...resolved, usesLoginShell: false };
  const commandIndex = resolved.args.indexOf("-c");
  const optionEnd = commandIndex < 0 ? resolved.args.length : commandIndex;
  const options = resolved.args.slice(0, optionEnd).filter((argument) => argument !== "-l");
  if (useLoginShell) options.unshift("-l");
  const args = [...options, ...resolved.args.slice(optionEnd)];
  return { ...resolved, args, usesLoginShell: useLoginShell };
}

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

export function defaultCwdDialect(platform: NodeJS.Platform): ExecutionShellDialect {
  return platform === "win32" ? "cmd" : "posix";
}
