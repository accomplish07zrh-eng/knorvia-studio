import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { getKnorviaDataRootDir } from "#src/paths.js";
import { commandHome } from "./commandLocations.js";

export type CommandConfiguration = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configPath(): string {
  return join(getKnorviaDataRootDir(), "cli", "config.json");
}

export async function readCommandConfiguration(): Promise<CommandConfiguration> {
  try {
    const config: unknown = JSON.parse(await readFile(configPath(), "utf-8"));
    return isRecord(config) ? config : {};
  } catch {
    return {};
  }
}

export async function writeCommandConfiguration(config: CommandConfiguration): Promise<void> {
  const filePath = configPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function enabledOverrides(config: CommandConfiguration): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!isRecord(config.command)) return result;
  for (const [filePath, entry] of Object.entries(config.command)) {
    if (isRecord(entry) && typeof entry.enable === "boolean") result.set(filePath, entry.enable);
  }
  return result;
}

export async function readEnabledOverrides(): Promise<Map<string, boolean>> {
  return enabledOverrides(await readCommandConfiguration());
}

export function withCommandEnabled(
  config: CommandConfiguration,
  filePath: string,
  enabled: boolean,
): CommandConfiguration {
  const command = isRecord(config.command) ? { ...config.command } : {};
  if (enabled) delete command[filePath];
  else command[filePath] = { enable: false };
  const next = { ...config };
  if (Object.keys(command).length) next.command = command;
  else delete next.command;
  return next;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export interface CommandPluginConfiguration {
  dirs: string[];
  enabled: boolean;
  enabledPlugins: Record<string, boolean>;
  suppressedBuiltins: string[];
  storageDir: string;
}

export function configuredPluginPath(directory: string): string {
  const expanded = directory.startsWith("~/") ? join(commandHome(), directory.slice(2)) : directory;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export function commandPluginConfiguration(
  config: CommandConfiguration,
): CommandPluginConfiguration {
  const plugin = isRecord(config.plugins) ? config.plugins : {};
  const enabledPlugins: Record<string, boolean> = {};
  if (isRecord(plugin.enabledPlugins)) {
    for (const [id, enabled] of Object.entries(plugin.enabledPlugins)) {
      if (typeof enabled === "boolean") enabledPlugins[id] = enabled;
    }
  }
  let storageDir: string;
  if (process.env.KNORVIA_PORTABLE_DIR?.trim()) {
    storageDir = getKnorviaDataRootDir();
  } else {
    const storage = isRecord(config.storage) ? config.storage : {};
    storageDir =
      typeof storage.dir === "string" && storage.dir.trim().length > 0
        ? storage.dir
        : getKnorviaDataRootDir();
  }
  return {
    dirs: stringArray(plugin.dirs),
    enabled: typeof plugin.enabled === "boolean" ? plugin.enabled : true,
    enabledPlugins,
    suppressedBuiltins: stringArray(plugin.suppressedBuiltins),
    storageDir,
  };
}
