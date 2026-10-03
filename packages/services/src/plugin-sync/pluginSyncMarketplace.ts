import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  directoryExists,
  readPluginManifest,
  record,
  required,
  safeDirectory,
  strings,
} from "./pluginSyncInventory.js";
import { resolvePluginSyncPathWithin } from "./pluginSyncPath.js";

interface MarketplaceEntry {
  name: string;
  dependencies: string[];
  source?: unknown;
  raw: Record<string, unknown>;
}

export interface MarketplaceManifest {
  name: string;
  description?: string;
  pluginRoot?: string;
  plugins: MarketplaceEntry[];
  raw: Record<string, unknown>;
}

export function parseMarketplace(value: unknown): MarketplaceManifest {
  if (!record(value)) throw new Error("marketplace manifest is invalid");
  const name = required(value.name, "marketplace name");
  const entries = Array.isArray(value.plugins)
    ? value.plugins
    : record(value.plugins)
      ? Object.entries(value.plugins).map(([key, entry]) =>
          record(entry) ? { name: key, ...entry } : { name: key },
        )
      : [];
  const metadata = record(value.metadata) ? value.metadata : {};
  const pluginRoot =
    typeof value.pluginRoot === "string" && value.pluginRoot.trim()
      ? value.pluginRoot.trim()
      : typeof metadata.pluginRoot === "string" && metadata.pluginRoot.trim()
        ? metadata.pluginRoot.trim()
        : undefined;
  return {
    name,
    raw: value,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(pluginRoot ? { pluginRoot } : {}),
    plugins: entries.filter(record).map((entry) => ({
      name: required(entry.name, "marketplace plugin name"),
      dependencies: strings(entry.dependencies),
      raw: entry,
      ...(entry.source !== undefined ? { source: entry.source } : {}),
    })),
  };
}

export async function readMarketplace(path: string): Promise<MarketplaceManifest> {
  return parseMarketplace(JSON.parse(await readFile(path, "utf8")));
}

export async function loadMarketplace(source: Record<string, unknown>) {
  const kind = typeof source.source === "string" ? source.source : "";
  if (kind === "settings") {
    if (!record(source.marketplace)) {
      throw new Error("settings marketplace source is missing marketplace manifest");
    }
    return { manifest: parseMarketplace(source.marketplace), sourceRoot: undefined };
  }
  if (kind === "file") {
    const path = required(source.path, "marketplace source file path");
    return { manifest: await readMarketplace(path), sourceRoot: dirname(path) };
  }
  if (kind === "directory") {
    const root = required(source.path, "marketplace source directory path");
    const path = [
      join(root, "marketplace.json"),
      join(root, ".claude-plugin", "marketplace.json"),
    ].find((candidate) => existsSync(candidate));
    if (!path) throw new Error(`marketplace manifest not found in directory: ${root}`);
    return { manifest: await readMarketplace(path), sourceRoot: root };
  }
  throw new Error(`unsupported marketplace source for SSH sync: ${kind || "unknown"}`);
}

export function dependencyClosure(
  manifest: MarketplaceManifest,
  selected: string[],
  marketplaceId: string,
): MarketplaceEntry[] {
  const entries = new Map(manifest.plugins.map((entry) => [entry.name, entry]));
  const visited = new Set<string>();
  const closure: MarketplaceEntry[] = [];
  function visit(value: string, requiredBy: string): void {
    const name = required(value, "marketplace plugin name");
    if (visited.has(name)) return;
    const entry = entries.get(name);
    if (!entry) throw new Error(`marketplace plugin not found: ${name}`);
    visited.add(name);
    closure.push(entry);
    for (const dependency of entry.dependencies) {
      const normalized = dependency.trim();
      const separator = normalized.lastIndexOf("@");
      let child = normalized;
      if (separator !== -1) {
        if (normalized.slice(separator + 1) !== marketplaceId) {
          throw new Error(
            `cross-marketplace dependency is not supported for SSH source mirror: ${dependency} required by ${requiredBy}`,
          );
        }
        child = normalized.slice(0, separator);
      }
      visit(child, entry.name);
    }
  }
  for (const name of selected) visit(name, name);
  return closure;
}

function sourceBase(manifest: MarketplaceManifest, sourceRoot?: string): string {
  if (!sourceRoot) throw new Error("cannot resolve marketplace plugin source root");
  if (!manifest.pluginRoot) return sourceRoot;
  const path = resolvePluginSyncPathWithin(sourceRoot, manifest.pluginRoot, {
    unsafePathLabel: "unsafe marketplace pluginRoot",
  });
  return existsSync(path) ? path : sourceRoot;
}

async function localPath(
  value: string,
  label: string,
  manifest: MarketplaceManifest,
  sourceRoot: string | undefined,
  allowAbsolute: boolean,
): Promise<string> {
  const path = required(value, label);
  if (!sourceRoot) {
    if (!allowAbsolute || !isAbsolute(path)) {
      throw new Error(
        `cannot mirror local marketplace plugin source without source root: ${value}`,
      );
    }
    const absolute = resolve(path);
    if (!(await directoryExists(absolute))) {
      throw new Error(`local marketplace plugin source does not exist: ${value}`);
    }
    return absolute;
  }
  const relative = path.startsWith("./") ? path.slice(2) : path;
  const resolved = resolvePluginSyncPathWithin(sourceBase(manifest, sourceRoot), relative, {
    unsafePathLabel: "unsafe marketplace plugin source path",
  });
  if (!(await directoryExists(resolved))) {
    throw new Error(`local marketplace plugin source does not exist: ${value}`);
  }
  return resolved;
}

export interface MarketplaceMirror {
  entry: MarketplaceEntry;
  sourcePath?: string;
  relativeSource?: string;
}

export async function prepareMirrors(
  manifest: MarketplaceManifest,
  closure: MarketplaceEntry[],
  sourceRoot?: string,
): Promise<MarketplaceMirror[]> {
  return Promise.all(
    closure.map(async (entry) => {
      const source = entry.source;
      if (
        record(source) &&
        typeof source.source === "string" &&
        ["github", "git", "url", "git-subdir", "npm", "pip"].includes(source.source)
      ) {
        return { entry };
      }
      let sourcePath: string;
      if (typeof source === "string") {
        sourcePath = await localPath(source, `${entry.name} source`, manifest, sourceRoot, false);
      } else if (
        record(source) &&
        source.source === "directory" &&
        typeof source.path === "string"
      ) {
        sourcePath = await localPath(
          source.path,
          `${entry.name} directory source`,
          manifest,
          sourceRoot,
          true,
        );
      } else {
        if (!sourceRoot) {
          throw new Error(
            `cannot mirror local marketplace plugin source without source root: ${entry.name}`,
          );
        }
        sourcePath = resolvePluginSyncPathWithin(sourceBase(manifest, sourceRoot), entry.name, {
          unsafePathLabel: "unsafe marketplace plugin source path",
        });
        if (!(await directoryExists(sourcePath))) {
          throw new Error(`local marketplace plugin source does not exist: ${sourcePath}`);
        }
      }
      if (!(await readPluginManifest(sourcePath))) {
        throw new Error(
          `local marketplace plugin source is missing plugin manifest: ${sourcePath}`,
        );
      }
      return { entry, sourcePath, relativeSource: `plugins/${safeDirectory(entry.name)}` };
    }),
  );
}

export function mirrorManifest(
  manifest: MarketplaceManifest,
  mirrors: MarketplaceMirror[],
): string {
  const raw = { ...manifest.raw };
  delete raw.pluginRoot;
  const output = {
    ...raw,
    name: manifest.name,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(mirrors.some((mirror) => mirror.sourcePath)
      ? { metadata: { ...(record(raw.metadata) ? raw.metadata : {}), pluginRoot: "plugins" } }
      : {}),
    plugins: mirrors.map(({ entry, relativeSource }) => ({
      ...entry.raw,
      name: entry.name,
      ...(relativeSource ? { source: `./${relativeSource.split("/").slice(1).join("/")}` } : {}),
    })),
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}
