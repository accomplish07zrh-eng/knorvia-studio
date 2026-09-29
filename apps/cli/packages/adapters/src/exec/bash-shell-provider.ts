// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { ExecutionShellDialect, ExecutionShellSelection } from "@knorvia/contracts";
import { windowsExecutableCandidates } from "./windows-executable.js";

type ExecutableCheck = (path: string) => boolean;
type EffectiveBashShellResolveOptions = {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform | string;
  exists?: ExecutableCheck;
  override?: ExecutionShellSelection;
};

export interface BashShellProvider {
  dialect: ExecutionShellDialect;
  envOverlay?: Record<string, string>;
  file: string;
  shell: boolean | string;
}

interface EffectiveBashShellResolution {
  selection: ExecutionShellSelection;
  provider?: BashShellProvider;
}

const defaultExecutableCheck: ExecutableCheck = (candidate) => {
  try {
    accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export function isExecutableCandidate(pathValue: string, exists = defaultExecutableCheck): boolean {
  return pathValue.trim() !== "" && exists(pathValue);
}

function displayName(file: string, dialect: ExecutionShellSelection["dialect"]): string {
  if (dialect === "cmd") return "Command Prompt";
  if (dialect === "git-bash") return "Git Bash";
  if (dialect === "legacy-shell") return "System Shell";
  return path.posix.basename(file).toLowerCase().includes("zsh") ? "Zsh" : "Bash";
}

function selection(
  file: string | undefined,
  dialect: ExecutionShellSelection["dialect"],
  source: ExecutionShellSelection["source"],
): ExecutionShellSelection {
  return { path: file, dialect, source, display: { name: displayName(file || "shell", dialect) } };
}

function providerFor(value: ExecutionShellSelection): BashShellProvider | undefined {
  if (!value.path || value.dialect === "legacy-shell") return undefined;
  if (value.dialect === "cmd") {
    return { dialect: "cmd", file: value.path, shell: false };
  }
  return {
    dialect: value.dialect,
    file: value.path,
    shell: false,
    envOverlay: { SHELL: value.path, GIT_EDITOR: "true" },
  };
}

function pathCandidates(names: readonly string[], env: NodeJS.ProcessEnv): string[] {
  const directories = (env.PATH ?? env.Path ?? "").split(":").filter(Boolean);
  return directories.flatMap((directory) => names.map((name) => path.posix.join(directory, name)));
}

function resolveRecorded(
  value: ExecutionShellSelection,
  exists: ExecutableCheck,
): EffectiveBashShellResolution {
  if (!value.path) return { selection: value };
  const bareCmd = value.dialect === "cmd" && value.path.toLowerCase() === "cmd.exe";
  if (!bareCmd && !isExecutableCandidate(value.path, exists)) return { selection: value };
  return { selection: value, provider: providerFor(value) };
}

function resolveWindows(
  env: NodeJS.ProcessEnv,
  exists: ExecutableCheck,
  override?: ExecutionShellSelection,
): EffectiveBashShellResolution {
  if (override?.source === "user-config" && override.path) {
    const base = path.win32.basename(override.path).toLowerCase();
    const accepted =
      override.dialect === "git-bash" || override.dialect === "cmd" || base === "cmd.exe";
    if (accepted) return resolveRecorded(override, exists);
  }
  const programFiles = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
    (value): value is string => Boolean(value),
  );
  const fixed = programFiles.flatMap((root) => [
    path.win32.join(root, "Git", "bin", "bash.exe"),
    path.win32.join(root, "Git", "usr", "bin", "bash.exe"),
    path.win32.join(root, "Programs", "Git", "bin", "bash.exe"),
    path.win32.join(root, "Programs", "Git", "usr", "bin", "bash.exe"),
  ]);
  const inferred: string[] = [];
  for (const git of windowsExecutableCandidates("git", env)) {
    if (exists(git))
      inferred.push(path.win32.resolve(path.win32.dirname(git), "..", "bin", "bash.exe"));
  }
  const candidates = [...new Set([...fixed, ...inferred])];
  const bash = candidates.find((candidate) => isExecutableCandidate(candidate, exists));
  if (bash) {
    const selected = selection(bash, "git-bash", "auto-detected");
    return { selection: selected, provider: providerFor(selected) };
  }
  const command = env.ComSpec || env.COMSPEC || "cmd.exe";
  const selected = selection(command, "legacy-shell", "legacy-fallback");
  return { selection: selected };
}

function resolvePosix(
  env: NodeJS.ProcessEnv,
  exists: ExecutableCheck,
  override?: ExecutionShellSelection,
): EffectiveBashShellResolution {
  if (override?.source === "user-config") return resolveRecorded(override, exists);
  const preferred = env.SHELL;
  const names = preferred && /(?:^|\/)(?:ba|z)sh$/.test(preferred) ? [preferred] : [];
  const candidates = [
    ...names,
    ...pathCandidates(["zsh", "bash"], env),
    "/bin/zsh",
    "/usr/bin/zsh",
    "/bin/bash",
    "/usr/bin/bash",
  ];
  const shell = [...new Set(candidates)].find((candidate) =>
    isExecutableCandidate(candidate, exists),
  );
  if (shell) {
    const selected = selection(shell, "posix", "auto-detected");
    return { selection: selected, provider: providerFor(selected) };
  }
  const selected = selection(preferred || "/bin/sh", "legacy-shell", "legacy-fallback");
  return { selection: selected };
}

export function resolveEffectiveBashShellSelection(
  options: EffectiveBashShellResolveOptions,
): EffectiveBashShellResolution {
  const exists = options.exists ?? defaultExecutableCheck;
  if (options.override && options.override.source !== "user-config") {
    return resolveRecorded(options.override, exists);
  }
  return options.platform === "win32"
    ? resolveWindows(options.env, exists, options.override)
    : resolvePosix(options.env, exists, options.override);
}
