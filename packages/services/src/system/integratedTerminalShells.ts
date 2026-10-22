import { accessSync, constants } from "node:fs";
import { win32 } from "node:path";
import type { IntegratedTerminalShellOption } from "@knorvia/shared";

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const key = Object.keys(env).find((entry) => entry.toLowerCase() === wanted);
  return key === undefined ? undefined : env[key];
}

function commandCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
  if (command.includes("/") || command.includes("\\")) {
    return [command];
  }

  const searchPath = environmentValue(env, "PATH");
  if (!searchPath) {
    return [command];
  }

  const extensions = (
    environmentValue(env, "PATHEXT")?.split(";") ?? [".COM", ".EXE", ".BAT", ".CMD"]
  )
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0);
  if (!extensions.includes(".exe")) {
    extensions.unshift(".exe");
  }

  const candidates: string[] = [];
  for (const directory of searchPath.split(";")) {
    if (directory.trim().length === 0) {
      continue;
    }
    for (const extension of extensions) {
      candidates.push(win32.join(directory, `${command}${extension}`));
    }
  }
  return candidates;
}

export function listIntegratedTerminalShellOptions(options: {
  env: NodeJS.ProcessEnv;
  isExecutable?: (path: string) => boolean;
  platform: NodeJS.Platform;
}): IntegratedTerminalShellOption[] {
  if (options.platform !== "win32") {
    return [];
  }

  const cmdPath = environmentValue(options.env, "ComSpec")?.trim() || "cmd.exe";
  const result: IntegratedTerminalShellOption[] = [
    {
      dialect: "cmd",
      id: `cmd:${cmdPath}`,
      label: "CMD",
      path: cmdPath,
      source: "system",
    },
  ];

  const suppliedProbe = options.isExecutable;
  const probe =
    suppliedProbe ||
    ((path: string): boolean => {
      try {
        accessSync(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

  const installations = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  const installedShell = installations.find((path) => probe(path));
  if (installedShell) {
    result.push({
      dialect: "git-bash",
      id: `git-bash:${installedShell}`,
      label: "Git Bash",
      path: installedShell,
      source: "system",
    });
    return result;
  }

  const gitPath = commandCandidates("git", options.env).find((path) => probe(path));
  if (!gitPath) {
    return result;
  }

  const directory = win32.dirname(gitPath);
  const inferredShells = [
    win32.normalize(win32.join(directory, "..", "bin", "bash.exe")),
    win32.normalize(win32.join(directory, "..", "..", "bin", "bash.exe")),
  ];
  const inferredShell = inferredShells.find((path) => probe(path));
  if (inferredShell) {
    result.push({
      dialect: "git-bash",
      id: `git-bash:${inferredShell}`,
      label: "Git Bash",
      path: inferredShell,
      source: "path",
    });
  }
  return result;
}
