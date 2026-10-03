import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { getKnorviaDataRootDir } from "#src/paths.js";

export interface SubagentStorageOptions {
  homeDir?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readUserCliConfig(
  options?: SubagentStorageOptions,
): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(join(resolveUserDataRoot(options), "cli", "config.json"), "utf8");
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveUserHomeDir(options?: SubagentStorageOptions): string {
  if (options?.homeDir && options.homeDir.trim().length > 0) {
    return options.homeDir;
  }

  const envHome = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();
  return envHome || homedir();
}

export function resolveUserDataRoot(options?: SubagentStorageOptions): string {
  if (options?.homeDir?.trim()) {
    return join(options.homeDir, ".knorvia-studio");
  }

  return getKnorviaDataRootDir();
}

export async function resolveUserSubagentRoot(options?: SubagentStorageOptions): Promise<string> {
  return join(await resolveKnorviaStorageRoot(options), "agents");
}

export function resolveWorkspaceSubagentRoot(workspacePath: string): string {
  return join(workspacePath, ".knorvia-studio", "agents");
}

export async function resolveSubagentStateFile(options?: SubagentStorageOptions): Promise<string> {
  return join(await resolveKnorviaStorageRoot(options), "v2", "agents-state.json");
}

export async function resolveKnorviaStorageRoot(options?: SubagentStorageOptions): Promise<string> {
  if (process.env.KNORVIA_PORTABLE_DIR?.trim()) {
    return getKnorviaDataRootDir();
  }

  const config = await readUserCliConfig(options);
  const storage = isRecord(config.storage) ? config.storage : {};
  const storageDir =
    typeof storage.dir === "string" && storage.dir.trim().length > 0
      ? storage.dir.trim()
      : resolveUserDataRoot(options);

  return resolveConfigPath(storageDir, options);
}

export function resolveConfigPath(path: string, options?: SubagentStorageOptions): string {
  const expanded = path.startsWith("~/") ? join(resolveUserHomeDir(options), path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}
