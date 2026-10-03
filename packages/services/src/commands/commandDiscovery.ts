import { DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS } from "@knorvia/shared";
import type { CommandAgentSource, CommandInfo, PluginCommand, UserCommand } from "@knorvia/shared";
import { existsSync } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readInstalledPluginRoots } from "#src/plugins/installedPluginRoots.js";
import { CommandFileParser } from "./commandFileParser.js";
import {
  commandPluginConfiguration,
  configuredPluginPath,
  isRecord,
  readCommandConfiguration,
} from "./commandConfig.js";
import type { CommandPluginConfiguration } from "./commandConfig.js";
import { commandName, commandTarget, discoveryDescriptors } from "./commandLocations.js";
import type { CommandTarget } from "./commandLocations.js";

export function userCommand(
  parsed: CommandInfo,
  filePath: string,
  agentSource: CommandAgentSource,
  target: CommandTarget,
  enabled: boolean,
): UserCommand {
  const name = commandName(target.rootPath, filePath);
  return {
    ...parsed,
    name,
    filePath,
    agentSource,
    location: { ...target.location },
    id: `${agentSource}:${target.location.source}:${target.scope}:${name}`,
    source: "user",
    enabled,
    scope: target.scope,
    ...(target.projectPath ? { projectPath: target.projectPath } : {}),
  };
}

async function walkUserDirectory(
  directory: string,
  target: CommandTarget,
  source: CommandAgentSource,
  overrides: Map<string, boolean>,
  result: UserCommand[],
): Promise<void> {
  const entries = await readdir(directory).catch(() => []);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const filePath = join(directory, entry);
    const stats = await lstat(filePath).catch(() => undefined);
    if (!stats) continue;
    if (stats.isDirectory()) {
      await walkUserDirectory(filePath, target, source, overrides, result);
    } else if (entry.toLowerCase().endsWith(".md")) {
      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = CommandFileParser.parseCommandFile(
          content,
          filePath,
          target.descriptor.format,
        );
        if (parsed)
          result.push(
            userCommand(parsed, filePath, source, target, overrides.get(filePath) ?? true),
          );
      } catch {
        continue;
      }
    }
  }
}

async function discoverUserDirectory(
  target: CommandTarget,
  source: CommandAgentSource,
  overrides: Map<string, boolean>,
  result: UserCommand[],
): Promise<number> {
  const before = result.length;
  try {
    await access(target.rootPath);
  } catch {
    return 0;
  }
  try {
    await walkUserDirectory(target.rootPath, target, source, overrides, result);
  } catch {
    // 已发现的命令在后续目录读取失败时仍保留，维持原有部分结果语义。
  }
  return result.length - before;
}

export async function discoverUserCommands(
  sources: readonly CommandAgentSource[],
  workspacePath: string | undefined,
  overrides: Map<string, boolean>,
): Promise<UserCommand[]> {
  const discovered: UserCommand[] = [];
  const scopes: Array<"user" | "project"> = workspacePath ? ["project", "user"] : ["user"];
  for (const source of sources) {
    for (const storageLevel of scopes) {
      for (const descriptor of discoveryDescriptors(source)) {
        const target = commandTarget(descriptor, storageLevel, workspacePath);
        const count = await discoverUserDirectory(target, source, overrides, discovered);
        if (descriptor.directorySource === "knorvia" && count > 0) break;
      }
    }
  }
  const names = new Set<string>();
  return discovered.filter((command) => {
    if (names.has(command.name)) return false;
    names.add(command.name);
    return true;
  });
}

interface PluginCandidate {
  rootPath: string;
  marketplace: string;
  defaultEnabled: boolean;
}

interface PluginCommandsRoot {
  rootPath: string;
  pluginName: string;
  pluginMarketplace: string;
  pluginEnabled: boolean;
}

async function officialCacheRoots(pluginRoot: string): Promise<string[]> {
  const cache = join(pluginRoot, "cache", "knorvia-plugins-bundled");
  const names = await readdir(cache).catch(() => []);
  const roots: string[] = [];
  for (const name of names) {
    const directory = join(cache, name);
    const versions = await readdir(directory).catch(() => []);
    for (const version of versions) {
      const rootPath = join(directory, version);
      const stats = await lstat(rootPath).catch(() => undefined);
      if (stats?.isDirectory()) roots.push(rootPath);
    }
  }
  return roots.sort((left, right) => left.localeCompare(right));
}

async function pluginManifest(
  rootPath: string,
): Promise<{ name: string; commands: unknown } | undefined> {
  const filePath = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]
    .map((directory) => join(rootPath, directory, "plugin.json"))
    .find((candidate) => existsSync(candidate));
  if (!filePath) return undefined;
  try {
    const manifest: unknown = JSON.parse(await readFile(filePath, "utf-8"));
    if (!isRecord(manifest) || typeof manifest.name !== "string") return undefined;
    const name = manifest.name.trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name)) return undefined;
    return { name, commands: manifest.commands };
  } catch {
    return undefined;
  }
}

function declaredCommandRoots(rootPath: string, commands: unknown): string[] {
  const values =
    typeof commands === "string"
      ? [commands]
      : Array.isArray(commands)
        ? commands.filter((value): value is string => typeof value === "string")
        : [];
  const roots: string[] = [];
  for (const value of values) {
    if (isAbsolute(value)) continue;
    const candidate = resolve(rootPath, value);
    const within = relative(rootPath, candidate);
    if (within === "" || (!within.startsWith("..") && !within.includes(`..${sep}`)))
      roots.push(candidate);
  }
  const defaultPath = join(rootPath, "commands");
  if (roots.length === 0 && commands === undefined && existsSync(defaultPath))
    roots.push(defaultPath);
  return roots;
}

async function discoverPluginRoots(
  config: CommandPluginConfiguration,
): Promise<PluginCommandsRoot[]> {
  if (!config.enabled) return [];
  const storageRoot = configuredPluginPath(config.storageDir);
  const cliRoot = basename(storageRoot) === "cli" ? storageRoot : join(storageRoot, "cli");
  const pluginRoot = join(cliRoot, "plugins");
  const cache = await officialCacheRoots(pluginRoot);
  const installed = await readInstalledPluginRoots(pluginRoot);
  const candidates: PluginCandidate[] = [
    ...config.dirs.map((directory) => ({
      rootPath: configuredPluginPath(directory),
      marketplace: "inline",
      defaultEnabled: true,
    })),
    ...cache.map((rootPath) => ({
      rootPath,
      marketplace: "knorvia-plugins-bundled",
      defaultEnabled: false,
    })),
    ...installed,
  ];
  const seen = new Set<string>();
  const roots: PluginCommandsRoot[] = [];
  for (const candidate of candidates) {
    const manifest = await pluginManifest(candidate.rootPath);
    if (!manifest) continue;
    const id = `${manifest.name}@${candidate.marketplace}`;
    if (
      candidate.marketplace === "knorvia-plugins-bundled" &&
      config.suppressedBuiltins.includes(id)
    )
      continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const defaultEnabled = candidate.defaultEnabled || DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(id);
    const enabled = config.enabledPlugins[id] ?? defaultEnabled;
    if (!enabled) continue;
    for (const rootPath of declaredCommandRoots(candidate.rootPath, manifest.commands)) {
      roots.push({
        rootPath,
        pluginEnabled: enabled,
        pluginMarketplace: candidate.marketplace,
        pluginName: manifest.name,
      });
    }
  }
  return roots;
}

async function walkPluginDirectory(
  directory: string,
  descriptor: PluginCommandsRoot,
  overrides: Map<string, boolean>,
  seen: Set<string>,
  result: PluginCommand[],
): Promise<void> {
  const entries = await readdir(directory).catch(() => []);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const filePath = join(directory, entry);
    const stats = await lstat(filePath).catch(() => undefined);
    if (!stats) continue;
    if (stats.isDirectory()) {
      await walkPluginDirectory(filePath, descriptor, overrides, seen, result);
    } else if (entry.toLowerCase().endsWith(".md")) {
      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = CommandFileParser.parseCommandFile(content, filePath);
        if (!parsed) continue;
        const name = commandName(descriptor.rootPath, filePath);
        const pathKey = filePath.replaceAll("\\", "/").toLowerCase();
        if (seen.has(pathKey)) continue;
        seen.add(pathKey);
        result.push({
          ...parsed,
          enabled: descriptor.pluginEnabled && (overrides.get(filePath) ?? true),
          filePath,
          id: `plugin:${descriptor.pluginMarketplace}:${descriptor.pluginName}:${name}:${filePath}`,
          name,
          pluginEnabled: descriptor.pluginEnabled,
          pluginMarketplace: descriptor.pluginMarketplace,
          pluginName: descriptor.pluginName,
          scope: "global",
          source: "plugin",
        });
      } catch {
        continue;
      }
    }
  }
}

export async function discoverPluginCommands(
  overrides: Map<string, boolean>,
): Promise<PluginCommand[]> {
  const config = commandPluginConfiguration(await readCommandConfiguration());
  const roots = await discoverPluginRoots(config);
  const result: PluginCommand[] = [];
  const seen = new Set<string>();
  for (const root of roots) await walkPluginDirectory(root.rootPath, root, overrides, seen, result);
  return result.sort((left, right) => left.name.localeCompare(right.name));
}
