import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import type { SettingsSyncSourceScope } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "../paths.js";
import { CommandFileParser } from "../commands/commandFileParser.js";
import { walkSkillMarkdownPaths } from "../skills/skillDiscoveryWalk.js";
import { locations, mcpLocations, sourceHome } from "./settingsSyncCatalog.js";
import type {
  JsonRecord,
  McpFormat,
  SourceCandidate,
  SyncCategory,
} from "./settingsSyncCatalog.js";

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}
export async function pathPresent(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}
export async function directoryPresent(directory: string): Promise<boolean> {
  try {
    await fs.readdir(directory);
    return true;
  } catch {
    return false;
  }
}
export async function readJsonRecord(filePath: string): Promise<JsonRecord> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
export function validServerMap(value: unknown): Record<string, JsonRecord> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([name, config]) => name !== "__proto__" && name.trim() && isRecord(config),
    ),
  ) as Record<string, JsonRecord>;
}
function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
function looseField(frontmatter: string, field: "name" | "version"): string | undefined {
  const match = frontmatter.match(new RegExp(`^${field}\\s*:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  let value = match[1]!.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}
export async function skillMetadata(
  markdownPath: string,
): Promise<{ name: string; version?: string }> {
  const fallback = path.basename(path.dirname(markdownPath));
  try {
    const content = (await fs.readFile(markdownPath, "utf8")).replace(/\r\n?/g, "\n");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
    if (frontmatter === undefined) return { name: fallback };
    let fields: JsonRecord = {};
    try {
      const parsed: unknown = parseYaml(frontmatter);
      if (isRecord(parsed)) fields = parsed;
    } catch {
      // Loose fields preserve metadata from malformed frontmatter.
    }
    const name = trimmedString(fields.name) || looseField(frontmatter, "name") || fallback;
    const version =
      (typeof fields.version === "string" || typeof fields.version === "number"
        ? String(fields.version).trim() || undefined
        : undefined) || looseField(frontmatter, "version");
    return { name, ...(version ? { version } : {}) };
  } catch {
    return { name: fallback };
  }
}
export async function skillPaths(root: string): Promise<string[]> {
  if (!(await directoryPresent(root))) return [];
  const found = new Set<string>();
  for await (const markdownPath of walkSkillMarkdownPaths(root)) found.add(markdownPath);
  return [...found].sort((a, b) => a.localeCompare(b));
}
export async function commandPaths(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) await visit(entryPath);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(entryPath);
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}
export function commandName(root: string, filePath: string): string {
  return (
    "/" +
    path.relative(root, filePath).replace(/\.md$/i, "").split(/[\\/]/).filter(Boolean).join("/")
  );
}
async function pluginManifestPath(directory: string): Promise<string | undefined> {
  for (const parent of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    const manifest = path.join(directory, parent, "plugin.json");
    if (await pathPresent(manifest)) return manifest;
  }
  return undefined;
}
export async function pluginMetadata(
  directory: string,
): Promise<{ name: string; version?: string; pluginId: string } | undefined> {
  const manifest = await pluginManifestPath(directory);
  if (!manifest) return undefined;
  const data = await readJsonRecord(manifest);
  const name = trimmedString(data.name);
  if (!name) return undefined;
  const version = trimmedString(data.version);
  return { name, pluginId: `${name}@inline`, ...(version ? { version } : {}) };
}
async function pluginPaths(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter(
        (entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()),
      )
      .map((entry) => path.join(root, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
function externalServer(config: JsonRecord, format: McpFormat): JsonRecord {
  let converted = { ...config };
  if (format === "opencode") {
    if (Array.isArray(config.command)) {
      const command = config.command.filter((part): part is string => typeof part === "string");
      if (command[0]) {
        const { command: _command, type: _type, ...rest } = config;
        converted = { ...rest, command: command[0], args: command.slice(1) };
        if (config.type === "local") converted.type = "stdio";
        else if (config.type === "remote") converted.type = "http";
      }
    } else if (
      config.type === "local" &&
      typeof config.command === "string" &&
      config.command.trim()
    ) {
      converted.command = config.command.trim();
      converted.type = "stdio";
    }
  }
  delete converted.timeout;
  delete converted.startup_timeout_sec;
  return converted;
}
async function externalServers(
  filePath: string,
  format: McpFormat,
): Promise<Record<string, JsonRecord>> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed: unknown = format === "toml" ? parseToml(content) : JSON.parse(content);
    if (!isRecord(parsed)) return {};
    const map = validServerMap(
      format === "toml"
        ? (parsed.mcp_servers ?? parsed.mcpServers)
        : format === "opencode"
          ? parsed.mcp
          : parsed.mcpServers,
    );
    return Object.fromEntries(
      Object.entries(map).map(([name, config]) => [name, externalServer(config, format)]),
    );
  } catch {
    return {};
  }
}
export async function discoverSources(
  category: SyncCategory,
  workspacePath?: string,
): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  const scopes: SettingsSyncSourceScope[] = workspacePath ? ["global", "project"] : ["global"];
  const home = sourceHome();
  for (const scope of scopes) {
    const base = scope === "global" ? home : workspacePath!;
    if (category === "mcpServers") {
      for (const location of mcpLocations) {
        for (const relative of scope === "global" ? [location.global] : location.project) {
          const filePath = path.join(base, relative);
          if (!(await pathPresent(filePath))) continue;
          for (const [name, config] of Object.entries(
            await externalServers(filePath, location.format),
          )) {
            const sourcePath = `${filePath}#${name}`;
            const key = `${location.agent}:${sourcePath}`;
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({
              category,
              agent: location.agent,
              scope,
              root: filePath,
              sourcePath,
              name,
              relativePath: "",
              config,
            });
          }
        }
      }
      continue;
    }
    for (const location of locations) {
      if (category !== "skills" && location.agent === "traeCn") continue;
      const root = path.join(
        base,
        scope === "global" ? location.global : location.project,
        category,
      );
      if (category !== "skills" && !(await directoryPresent(root))) continue;
      const paths =
        category === "skills"
          ? await skillPaths(root)
          : category === "commands"
            ? await commandPaths(root)
            : await pluginPaths(root);
      for (const foundPath of paths) {
        if (category === "plugins" && !(await pluginManifestPath(foundPath))) continue;
        if (seen.has(foundPath)) continue;
        seen.add(foundPath);
        const defaultTargetRoot =
          category === "skills" || category === "commands"
            ? scope === "global"
              ? path.join(getKnorviaDataRootDir(), category)
              : workspacePath
                ? path.join(workspacePath, ".knorvia-studio", category)
                : undefined
            : undefined;
        const sourcePath = category === "skills" ? path.dirname(foundPath) : foundPath;
        const common = {
          category,
          agent: location.agent,
          scope,
          root,
          sourcePath,
          defaultTargetRoot,
          relativePath:
            category === "commands" ? path.relative(root, foundPath) : path.basename(sourcePath),
        };
        if (category === "skills")
          candidates.push({ ...common, ...(await skillMetadata(foundPath)) });
        else if (category === "plugins") {
          const metadata = await pluginMetadata(foundPath);
          if (metadata) candidates.push({ ...common, ...metadata });
        } else {
          const candidate: SourceCandidate = { ...common, name: commandName(root, foundPath) };
          try {
            const metadata = CommandFileParser.parseCommandFile(
              await fs.readFile(foundPath, "utf8"),
              foundPath,
            );
            if (metadata?.description) candidate.description = metadata.description;
            if (metadata?.argumentHint) candidate.argumentHint = metadata.argumentHint;
          } catch {
            // The relative command name remains usable without optional metadata.
          }
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates;
}
