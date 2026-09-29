// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import path from "node:path";

const DEFAULT_PATHEXT = [".com", ".exe", ".bat", ".cmd"];

export function getWindowsEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const wanted = key.toLowerCase();
  for (const [candidate, value] of Object.entries(env)) {
    if (candidate.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function executableNames(file: string, env: NodeJS.ProcessEnv): string[] {
  if (path.win32.extname(file) !== "") return [file];
  const configured = getWindowsEnvValue(env, "PATHEXT")
    ?.split(";")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const suffixes = configured?.length ? configured : DEFAULT_PATHEXT;
  return [
    file,
    ...suffixes.map((suffix) => `${file}${suffix.startsWith(".") ? suffix : `.${suffix}`}`),
  ];
}

export function windowsExecutableCandidates(
  file: string,
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
): string[] {
  const names = executableNames(file, env);
  const hasSeparator = file.includes("/") || file.includes("\\");
  if (hasSeparator) {
    return names.map((name) =>
      path.win32.isAbsolute(name) ? name : path.win32.resolve(cwd, name),
    );
  }
  const pathValue = getWindowsEnvValue(env, "PATH") ?? "";
  const directories = pathValue.split(";").filter((value) => value !== "");
  const candidates: string[] = [];
  for (const directory of directories) {
    for (const name of names) candidates.push(path.win32.join(directory, name));
  }
  return candidates;
}
