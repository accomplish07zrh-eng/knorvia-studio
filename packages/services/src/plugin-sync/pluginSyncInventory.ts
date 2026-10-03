import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { PluginSyncCandidate, PluginSyncComponentType } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "../paths.js";
import { normalizePluginSyncRelativePath } from "./pluginSyncPath.js";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing ${label}`);
  return value.trim();
}

export function pluginId(value: string): string {
  const normalized = value.trim();
  if (!normalized || /[/\\]/.test(normalized)) throw new Error(`invalid plugin id: ${value}`);
  return normalized;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeDirectory(value: string): string {
  const replaced = value.trim().replace(/[/\\:]/g, "-") || "plugin";
  try {
    return normalizePluginSyncRelativePath(replaced);
  } catch {
    return `plugin-${sha256(value).slice(0, 8)}`;
  }
}

export function pluginRoot(): string {
  return join(getKnorviaDataRootDir(), "plugins");
}

export function configPath(): string {
  return join(getKnorviaDataRootDir(), "cli", "config.json");
}

export async function readConfig(path = configPath()): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return {};
    throw error;
  }
  const parsed: unknown = JSON.parse(content);
  if (!record(parsed)) throw new Error(`invalid json object: ${path}`);
  return parsed;
}

async function configuration() {
  const config = await readConfig();
  const plugins = record(config.plugins) ? config.plugins : {};
  const enabled = record(plugins.enabledPlugins) ? plugins.enabledPlugins : {};
  const overrides = new Map<string, boolean>();
  for (const [id, value] of Object.entries(enabled)) {
    if (typeof value === "boolean") overrides.set(pluginId(id).toLowerCase(), value);
  }
  return { dirs: strings(plugins.dirs), overrides };
}

async function present(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function readPluginManifest(root: string) {
  for (const directory of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    let content: string;
    try {
      content = await readFile(join(root, directory, "plugin.json"), "utf8");
    } catch {
      continue;
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(content);
    } catch {
      return null;
    }
    if (!record(manifest) || typeof manifest.name !== "string" || !manifest.name.trim()) {
      return null;
    }
    const name = manifest.name.trim();
    const componentTypes: PluginSyncComponentType[] = [];
    const components: Array<[PluginSyncComponentType, string, string]> = [
      ["skills", "skills", "skills"],
      ["commands", "commands", "commands"],
      ["hooks", "hooks", "hooks/hooks.json"],
      ["mcp", "mcpServers", ".mcp.json"],
    ];
    for (const [type, property, path] of components) {
      if (property in manifest || (await present(join(root, path)))) {
        componentTypes.push(type);
      }
    }
    return {
      name,
      pluginId: `${name}@inline`,
      componentTypes,
      ...(typeof manifest.description === "string" && manifest.description.trim()
        ? { description: manifest.description.trim() }
        : {}),
      ...(typeof manifest.version === "string" && manifest.version.trim()
        ? { version: manifest.version.trim() }
        : {}),
    };
  }
  return null;
}

export async function treeSize(path: string): Promise<number> {
  const stat = await lstat(path);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let size = 0;
  for (const name of await readdir(path)) size += await treeSize(join(path, name));
  return size;
}

async function canonicalDirectory(directory: string): Promise<string> {
  const path = resolve(directory);
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

export async function collectCandidates(): Promise<PluginSyncCandidate[]> {
  const { dirs, overrides } = await configuration();
  const paths = new Set<string>();
  const names = new Set<string>();
  const candidates: PluginSyncCandidate[] = [];
  for (const directory of dirs) {
    const path = await canonicalDirectory(directory);
    if (paths.has(path)) continue;
    paths.add(path);
    const manifest = await readPluginManifest(path);
    if (!manifest) continue;
    const base = safeDirectory(basename(path) || manifest.name);
    const directoryName = names.has(base)
      ? safeDirectory(`${base}-${sha256(path).slice(0, 8)}`)
      : base;
    names.add(directoryName);
    const enabledOverride = overrides.get(pluginId(manifest.pluginId).toLowerCase());
    candidates.push({
      ...manifest,
      id: sha256(`${manifest.pluginId}:${path}`),
      directoryName,
      path,
      sizeBytes: await treeSize(path),
      enabled: enabledOverride ?? true,
      ...(enabledOverride !== undefined ? { enabledOverride } : {}),
    });
  }
  return candidates.sort((left, right) => left.name.localeCompare(right.name));
}

export async function configuredIds(): Promise<Map<string, string>> {
  const { dirs } = await configuration();
  const ids = new Map<string, string>();
  for (const directory of dirs) {
    const path = await canonicalDirectory(directory);
    const manifest = await readPluginManifest(path);
    if (!manifest) continue;
    const id = pluginId(manifest.pluginId).toLowerCase();
    if (!ids.has(id)) ids.set(id, path);
  }
  return ids;
}

export async function registerPlugin(target: string, id: string, enabled?: boolean): Promise<void> {
  const path = configPath();
  const config = await readConfig(path);
  const plugins = record(config.plugins) ? config.plugins : {};
  const dirs = strings(plugins.dirs);
  const targetPath = resolve(target);
  if (!dirs.some((path) => resolve(path) === targetPath)) dirs.push(targetPath);
  const overrides = record(plugins.enabledPlugins) ? plugins.enabledPlugins : {};
  const nextPlugins: Record<string, unknown> = { ...plugins, dirs };
  if (enabled !== undefined) nextPlugins.enabledPlugins = { ...overrides, [id]: enabled };
  else if (Object.keys(overrides).length) nextPlugins.enabledPlugins = overrides;
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.tmp-${basename(path)}-${randomUUID()}`);
  await writeFile(temporary, `${JSON.stringify({ ...config, plugins: nextPlugins }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}
