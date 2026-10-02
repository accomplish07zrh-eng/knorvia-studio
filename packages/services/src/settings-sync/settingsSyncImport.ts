import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SettingsSyncImportMode, SettingsSyncSourceScope } from "@knorvia/shared";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { getKnorviaDataRootDir } from "../paths.js";
import type { JsonRecord, SourceCandidate, SyncCategory } from "./settingsSyncCatalog.js";
import {
  commandName,
  commandPaths,
  directoryPresent,
  isRecord,
  normalizedName,
  pathPresent,
  pluginMetadata,
  readJsonRecord,
  skillMetadata,
  skillPaths,
  validServerMap,
} from "./settingsSyncSources.js";

const logger = createServiceLogger("settings-sync");

export type SkipReason = "targetExists" | "sameNameExists";
export interface Destination {
  scope: SettingsSyncSourceScope;
  root?: string;
  configPath?: string;
  targetPath?: string;
}
export function destinationFor(
  candidate: SourceCandidate,
  workspacePath?: string,
  targetScope?: SettingsSyncSourceScope,
): Destination {
  const scope = targetScope === undefined ? candidate.scope : targetScope;
  if (
    targetScope === undefined &&
    (candidate.category === "skills" || candidate.category === "commands")
  ) {
    const root = candidate.defaultTargetRoot;
    return root ? { scope, root, targetPath: path.join(root, candidate.relativePath) } : { scope };
  }
  const base =
    scope === "global"
      ? getKnorviaDataRootDir()
      : workspacePath
        ? path.join(workspacePath, ".knorvia-studio")
        : undefined;
  if (!base) return { scope };
  const configPath =
    scope === "global" ? path.join(base, "cli", "config.json") : path.join(base, "config.json");
  if (candidate.category === "mcpServers") return { scope, configPath };
  const root = path.join(base, candidate.category);
  return { scope, root, configPath, targetPath: path.join(root, candidate.relativePath) };
}

// A pass owns its name sets; successful writes alone add reservations.
export class CollisionPass {
  private readonly names = new Map<SyncCategory, Map<string, Set<string>>>();

  private async namesAt(category: SyncCategory, destination: Destination): Promise<Set<string>> {
    const key =
      category === "mcpServers"
        ? destination.scope
        : category === "plugins"
          ? destination.configPath!
          : destination.root!;
    let categoryNames = this.names.get(category);
    if (!categoryNames) {
      categoryNames = new Map();
      this.names.set(category, categoryNames);
    }
    const cached = categoryNames.get(key);
    if (cached) return cached;
    const found = new Set<string>();
    if (category === "skills") {
      for (const markdownPath of await skillPaths(destination.root!)) {
        found.add(normalizedName((await skillMetadata(markdownPath)).name));
      }
    } else if (category === "commands") {
      for (const filePath of await commandPaths(destination.root!)) {
        found.add(normalizedName(commandName(destination.root!, filePath)));
      }
    } else if (category === "plugins") {
      const config = await readJsonRecord(destination.configPath!);
      const plugins = isRecord(config.plugins) ? config.plugins : {};
      for (const directory of stringEntries(plugins.dirs)) {
        const metadata = await pluginMetadata(path.resolve(directory));
        if (metadata) found.add(metadata.pluginId.toLowerCase());
      }
    } else {
      const config = await readJsonRecord(destination.configPath!);
      const mcp = isRecord(config.mcp) ? config.mcp : {};
      for (const name of Object.keys(validServerMap(mcp.servers))) found.add(normalizedName(name));
    }
    categoryNames.set(key, found);
    return found;
  }

  async conflict(
    candidate: SourceCandidate,
    destination: Destination,
  ): Promise<SkipReason | undefined> {
    if (candidate.category === "mcpServers") {
      if (!destination.configPath) return "sameNameExists";
    } else {
      if (!destination.targetPath) return "targetExists";
      const occupied =
        candidate.category === "skills"
          ? await directoryPresent(destination.targetPath)
          : await pathPresent(destination.targetPath);
      if (occupied) return "targetExists";
      if (candidate.category === "plugins" && !destination.configPath) return "targetExists";
    }
    const names = await this.namesAt(candidate.category, destination);
    const key =
      candidate.category === "plugins"
        ? candidate.pluginId!.toLowerCase()
        : normalizedName(candidate.name);
    return names.has(key) ? "sameNameExists" : undefined;
  }

  async reserve(candidate: SourceCandidate, destination: Destination): Promise<void> {
    const names = await this.namesAt(candidate.category, destination);
    names.add(
      candidate.category === "plugins"
        ? candidate.pluginId!.toLowerCase()
        : normalizedName(candidate.name),
    );
  }
}

function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
async function writeConfig(configPath: string, config: JsonRecord): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
export async function registerPlugin(configPath: string, targetPath: string): Promise<void> {
  const config = await readJsonRecord(configPath);
  const plugins = isRecord(config.plugins) ? config.plugins : {};
  const dirs = stringEntries(plugins.dirs);
  const resolvedTarget = path.resolve(targetPath);
  if (dirs.some((directory) => path.resolve(directory) === resolvedTarget)) return;
  await writeConfig(configPath, {
    ...config,
    plugins: { ...plugins, dirs: [...dirs, resolvedTarget] },
  });
}
export async function mergeServer(configPath: string, candidate: SourceCandidate): Promise<void> {
  const config = await readJsonRecord(configPath);
  const mcp = isRecord(config.mcp) ? config.mcp : {};
  await writeConfig(configPath, {
    ...config,
    mcp: {
      ...mcp,
      servers: { ...validServerMap(mcp.servers), [candidate.name]: candidate.config! },
    },
  });
}
export async function importFilesystem(
  candidate: SourceCandidate,
  targetPath: string,
  mode: SettingsSyncImportMode,
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const source = path.resolve(candidate.sourcePath);
  if (mode !== "symlink") {
    await fs.cp(source, targetPath, {
      ...(candidate.category === "commands" ? {} : { recursive: true }),
      errorOnExist: true,
      force: false,
    });
    return;
  }
  if (candidate.category !== "commands") {
    await fs.symlink(source, targetPath, process.platform === "win32" ? "junction" : "dir");
  } else if (process.platform !== "win32") {
    await fs.symlink(source, targetPath, "file");
  } else {
    try {
      await fs.link(source, targetPath);
      logger.info(undefined, "Imported command using hard link", {
        sourcePath: source,
        targetPath,
      });
    } catch (error) {
      logger.warn(undefined, "Command hard link failed; copying instead", {
        sourcePath: source,
        targetPath,
        error,
      });
      await fs.cp(source, targetPath, { errorOnExist: true, force: false });
    }
  }
}
