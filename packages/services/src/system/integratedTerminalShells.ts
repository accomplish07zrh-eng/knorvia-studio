import { accessSync, constants } from "node:fs";
import { win32 } from "node:path";
import type { IntegratedTerminalShellOption } from "@knorvia/shared";

/** 一个候选 shell：方言、稳定 id、展示名、以及若干可能的可执行路径。 */
interface ShellCandidate {
  dialect: IntegratedTerminalShellOption["dialect"];
  id: string;
  label: string;
  /** 系统自带位置（`source: "system"`）。 */
  systemPaths: readonly string[];
  /** `PATH` 中的命令名（`source: "path"`）。 */
  commandNames: readonly string[];
}

/**
 * Windows 上支持的 shell 候选。
 *
 * - `cmd`：系统自带 `System32\cmd.exe`；
 * - `git-bash`：Git for Windows 的 `bin\bash.exe`（64 位 / 32 位 / 用户级安装）。
 *
 * 这些是 Windows 与 Git for Windows 的公开目录约定。
 */
function windowsCandidates(env: NodeJS.ProcessEnv): ShellCandidate[] {
  const systemRoot = env["SystemRoot"]?.trim() || "C:\\Windows";
  const programFiles = env["ProgramFiles"]?.trim() || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"]?.trim() || "C:\\Program Files (x86)";
  const localAppData = env["LOCALAPPDATA"]?.trim();

  const gitBashPaths = [
    win32.join(programFiles, "Git", "bin", "bash.exe"),
    win32.join(programFilesX86, "Git", "bin", "bash.exe"),
    ...(localAppData === undefined
      ? []
      : [win32.join(localAppData, "Programs", "Git", "bin", "bash.exe")]),
  ];

  return [
    {
      dialect: "cmd",
      id: "cmd",
      label: "Command Prompt",
      systemPaths: [win32.join(systemRoot, "System32", "cmd.exe")],
      commandNames: ["cmd.exe", "cmd"],
    },
    {
      dialect: "git-bash",
      id: "git-bash",
      label: "Git Bash",
      systemPaths: gitBashPaths,
      commandNames: ["bash.exe", "bash"],
    },
  ];
}

/** 可执行判定：默认用 `accessSync` + `X_OK`，可被注入覆盖。 */
function defaultIsExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 在 `PATH` 里按命令名查找可执行文件（返回第一个命中的完整路径）。 */
function findOnPath(
  commandName: string,
  env: NodeJS.ProcessEnv,
  isExecutable: (path: string) => boolean,
): string | undefined {
  const pathValue = env["PATH"];
  if (!pathValue) return undefined;

  for (const segment of pathValue.split(win32.delimiter)) {
    const directory = segment.trim();
    if (directory.length === 0) continue;
    const candidate = win32.join(directory, commandName);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

/**
 * 列出当前 Windows 环境可用的集成终端 shell。
 *
 * 每个候选先看系统自带路径（`source: "system"`），再退到 `PATH` 查找（`source: "path"`）。
 * 非 Windows 平台返回空列表 —— 集成终端 shell 是 Windows 专属能力。
 *
 * 同一 `dialect` 只返回第一个命中的候选，避免「cmd 出现两次」。
 */
export function listIntegratedTerminalShellOptions(options: {
  env: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform: NodeJS.Platform;
}): IntegratedTerminalShellOption[] {
  if (options.platform !== "win32") return [];

  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const resolved: IntegratedTerminalShellOption[] = [];

  for (const candidate of windowsCandidates(options.env)) {
    const systemHit = candidate.systemPaths.find((path) => isExecutable(path));
    if (systemHit !== undefined) {
      resolved.push({
        source: "system",
        dialect: candidate.dialect,
        id: candidate.id,
        label: candidate.label,
        path: systemHit,
      });
      continue;
    }

    const commandHit = candidate.commandNames
      .map((name) => findOnPath(name, options.env, isExecutable))
      .find((path) => path !== undefined);
    if (commandHit !== undefined) {
      resolved.push({
        source: "path",
        dialect: candidate.dialect,
        id: candidate.id,
        label: candidate.label,
        path: commandHit,
      });
    }
  }
  return resolved;
}
