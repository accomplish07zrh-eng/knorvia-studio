import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

import { getRuntimeToolRuntime, type RuntimeToolId } from "@knorvia/shared";

function combinePathEntries(entries: readonly string[]): string {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }

  return result.join(delimiter);
}

export function prependPathEntries(
  currentPath: string | undefined,
  entries: readonly string[],
): string {
  const currentEntries = currentPath?.split(delimiter).filter(Boolean) ?? [];
  return combinePathEntries([...entries, ...currentEntries]);
}

export function appendPathEntries(
  currentPath: string | undefined,
  entries: readonly string[],
): string {
  const currentEntries = currentPath?.split(delimiter).filter(Boolean) ?? [];
  return combinePathEntries([...currentEntries, ...entries]);
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isBinaryCandidate(path: string | undefined): path is string {
  if (!path) return false;
  return existsSync(path) && isExecutable(path);
}

function findCommandOnPath(command: string, env: NodeJS.ProcessEnv): string | null {
  if (!env.PATH) return null;

  const extensions =
    process.platform === "win32" && !command.includes(".")
      ? (env.PATHEXT?.split(";").filter(Boolean) ?? [".EXE", ".CMD", ".BAT", ".COM"])
      : [""];

  for (const entry of env.PATH.split(delimiter)) {
    if (!entry) continue;
    for (const extension of extensions) {
      const path = join(entry, command + extension);
      if (isExecutable(path)) return path;
    }
  }

  return null;
}

function findRuntimeToolBinary(toolId: RuntimeToolId, env: NodeJS.ProcessEnv): string | null {
  const descriptor = getRuntimeToolRuntime(toolId);
  const segments = descriptor.resolveEntrySegments(process.platform);
  const override = env[descriptor.binaryEnvVar]?.trim();
  if (isBinaryCandidate(override)) return override;

  const resourceProcess = process as NodeJS.Process & { resourcesPath?: unknown };
  const resourcesPath =
    typeof resourceProcess.resourcesPath === "string" ? resourceProcess.resourcesPath : undefined;
  const runtimeRoot = env.KNORVIA_SERVER_RUNTIME_ROOT?.trim();
  const moduleDir = import.meta.dirname;
  const platformKey = `${process.platform}-${process.arch}`;
  const candidates: string[] = [];

  if (runtimeRoot) {
    candidates.push(resolve(runtimeRoot, "tools", descriptor.bundledResourceDir, ...segments));
  }
  if (resourcesPath) {
    candidates.push(resolve(resourcesPath, "tools", descriptor.bundledResourceDir, ...segments));
  }

  const bundledRoots = [
    resolve(process.cwd(), "bundled-tools", platformKey),
    resolve(process.cwd(), "packages", "desktop", "bundled-tools", platformKey),
    resolve(process.cwd(), "..", "desktop", "bundled-tools", platformKey),
    moduleDir
      ? resolve(moduleDir, "..", "..", "..", "desktop", "bundled-tools", platformKey)
      : null,
    moduleDir ? resolve(moduleDir, "..", "..", "desktop", "bundled-tools", platformKey) : null,
  ];

  for (const root of bundledRoots) {
    if (root === null) continue;
    candidates.push(resolve(root, descriptor.bundledResourceDir, ...segments));
  }

  for (const candidate of candidates) {
    if (isBinaryCandidate(candidate)) return candidate;
  }

  const binaryName = segments[segments.length - 1];
  if (!binaryName) return null;
  return findCommandOnPath(binaryName.replace(/\.exe$/i, ""), env);
}

export function buildRuntimeToolEnvPatch(
  toolIds: readonly RuntimeToolId[],
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const patch: Record<string, string> = {};
  const directories: string[] = [];

  for (const toolId of toolIds) {
    const descriptor = getRuntimeToolRuntime(toolId);
    const binaryPath = findRuntimeToolBinary(toolId, baseEnv);
    if (binaryPath === null) continue;
    patch[descriptor.binaryEnvVar] = binaryPath;
    directories.push(dirname(binaryPath));
  }

  if (directories.length > 0) {
    patch.PATH = appendPathEntries(baseEnv.PATH, directories);
  }

  return patch;
}
