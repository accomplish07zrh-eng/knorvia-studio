import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS } from "@knorvia/shared";
import type { SkillScope } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "#src/paths.js";
import { readInstalledPluginRoots } from "#src/plugins/installedPluginRoots.js";
import { isRecord } from "./skillDefinitions.js";
import { exists, getSkillHome, readCliConfig } from "./skillLocations.js";

export interface SkillRoot {
  rootPath: string;
  scope: SkillScope;
  pluginName?: string;
  pluginId?: string;
}

interface PluginCandidate {
  rootPath: string;
  marketplace: string;
  defaultEnabled: boolean;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function resolveConfiguredPath(path: string): string {
  const expanded = path.startsWith("~/") ? join(getSkillHome(), path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

function pluginStorageRoot(config: Record<string, unknown>): string {
  const storage = isRecord(config.storage) ? config.storage : {};
  const raw = process.env.KNORVIA_PORTABLE_DIR?.trim()
    ? getKnorviaDataRootDir()
    : typeof storage.dir === "string" && storage.dir.trim()
      ? storage.dir
      : getKnorviaDataRootDir();
  const root = resolveConfiguredPath(raw);
  return join(basename(root) === "cli" ? root : join(root, "cli"), "plugins");
}

async function officialCandidates(storageRoot: string): Promise<PluginCandidate[]> {
  const cacheRoot = join(storageRoot, "cache", "knorvia-plugins-bundled");
  const plugins = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  const roots: string[] = [];
  for (const plugin of plugins) {
    if (!plugin.isDirectory()) continue;
    const pluginRoot = join(cacheRoot, plugin.name);
    const versions = await readdir(pluginRoot, { withFileTypes: true }).catch(() => []);
    for (const version of versions) {
      if (version.isDirectory()) roots.push(join(pluginRoot, version.name));
    }
  }
  return roots
    .sort((left, right) => left.localeCompare(right))
    .map((rootPath) => ({
      rootPath,
      marketplace: "knorvia-plugins-bundled",
      defaultEnabled: false,
    }));
}

async function readManifest(root: string): Promise<{ name: string; skills: unknown } | null> {
  for (const directory of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    const path = join(root, directory, "plugin.json");
    if (!(await exists(path))) continue;
    try {
      const manifest: unknown = JSON.parse(await readFile(path, "utf-8"));
      if (!isRecord(manifest) || typeof manifest.name !== "string") return null;
      const name = manifest.name.trim();
      return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(name) ? { name, skills: manifest.skills } : null;
    } catch {
      return null;
    }
  }
  return null;
}

function manifestSkillRoots(root: string, skills: unknown): string[] {
  const values = typeof skills === "string" ? [skills] : stringArray(skills);
  const roots: string[] = [];
  for (const value of values) {
    if (isAbsolute(value)) continue;
    const candidate = resolve(root, value);
    const distance = relative(root, candidate);
    if (distance === "" || (!distance.startsWith("..") && !distance.includes(`..${sep}`))) {
      roots.push(candidate);
    }
  }
  if (!roots.length && skills === undefined && existsSync(join(root, "skills"))) {
    roots.push(join(root, "skills"));
  }
  return roots;
}

export async function getPluginSkillRoots(): Promise<SkillRoot[]> {
  const config = await readCliConfig();
  const plugins = isRecord(config.plugins) ? config.plugins : {};
  if (typeof plugins.enabled === "boolean" && !plugins.enabled) return [];
  const storageRoot = pluginStorageRoot(config);
  const configuredDirs = stringArray(plugins.dirs);
  const enabledPlugins: Record<string, boolean> = {};
  if (isRecord(plugins.enabledPlugins)) {
    for (const [id, value] of Object.entries(plugins.enabledPlugins)) {
      if (typeof value === "boolean") enabledPlugins[id] = value;
    }
  }
  const suppressed = stringArray(plugins.suppressedBuiltins);
  const cached = await officialCandidates(storageRoot);
  const installed = await readInstalledPluginRoots(storageRoot);
  const candidates: PluginCandidate[] = [
    ...configuredDirs.map((path) => ({
      rootPath: resolveConfiguredPath(path),
      marketplace: "inline",
      defaultEnabled: true,
    })),
    ...cached,
    ...installed,
  ];
  const seen = new Set<string>();
  const roots: SkillRoot[] = [];
  for (const candidate of candidates) {
    const manifest = await readManifest(candidate.rootPath);
    if (!manifest) continue;
    const id = `${manifest.name}@${candidate.marketplace}`;
    if (candidate.marketplace === "knorvia-plugins-bundled" && suppressed.includes(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const defaultEnabled = candidate.defaultEnabled || DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(id);
    if (!(enabledPlugins[id] ?? defaultEnabled)) continue;
    for (const rootPath of manifestSkillRoots(candidate.rootPath, manifest.skills)) {
      roots.push({ rootPath, scope: "plugin", pluginName: manifest.name, pluginId: id });
    }
  }
  return roots;
}
