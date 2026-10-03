import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS,
  KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID,
  createPluginAgentStateId,
  type AgentDiagnostic,
  type AgentSummary,
  type PluginSubagentModelSelectionOverrides,
} from "@knorvia/shared";
import { scanOfficialPluginCacheRoots } from "@knorvia/shared/node";
import { collectMarkdown, builtInNames } from "./subagentServiceFiles.js";
import { parseSubagentMarkdown } from "./subagentMarkdown.js";
import {
  resolveKnorviaStorageRoot,
  resolveUserDataRoot,
  type SubagentStorageOptions,
} from "./subagentStorage.js";

interface InstalledPluginRecord {
  id: string;
  installPath: string;
  name: string;
  scope?: "user" | "workspace";
  projectPath?: string;
}

interface PluginConfigSummary {
  enabledPlugins: Record<string, boolean>;
  suppressedBuiltins: string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function config(options: SubagentStorageOptions): Promise<PluginConfigSummary> {
  try {
    const parsed = JSON.parse(
      await readFile(join(resolveUserDataRoot(options), "cli", "config.json"), "utf-8"),
    );
    const plugins = record(parsed) && record(parsed.plugins) ? parsed.plugins : {};
    const enabledPlugins = record(plugins.enabledPlugins)
      ? Object.fromEntries(
          Object.entries(plugins.enabledPlugins).filter(
            (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
          ),
        )
      : {};
    return {
      enabledPlugins,
      suppressedBuiltins: Array.isArray(plugins.suppressedBuiltins)
        ? plugins.suppressedBuiltins.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return { enabledPlugins: {}, suppressedBuiltins: [] };
  }
}

async function installed(cliRoot: string): Promise<InstalledPluginRecord[]> {
  try {
    const parsed = JSON.parse(
      await readFile(join(cliRoot, "plugins", "installed_plugins.json"), "utf-8"),
    );
    if (!Array.isArray(parsed.plugins)) return [];
    return parsed.plugins.filter(
      (entry: unknown): entry is InstalledPluginRecord =>
        record(entry) &&
        typeof entry.id === "string" &&
        typeof entry.installPath === "string" &&
        typeof entry.name === "string",
    );
  } catch {
    return [];
  }
}

async function manifest(root: string): Promise<Record<string, unknown> | null> {
  for (const directory of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(root, directory, "plugin.json"), "utf-8"),
      );
      if (record(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

async function activePlugins(options: SubagentStorageOptions): Promise<InstalledPluginRecord[]> {
  const storageRoot = await resolveKnorviaStorageRoot(options);
  const cliRoot = basename(storageRoot) === "cli" ? storageRoot : join(storageRoot, "cli");
  const settings = await config(options);
  const records = await installed(cliRoot);
  const suppressed = new Set(settings.suppressedBuiltins);
  const officialSuffix = "@" + KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID;
  const active = records.filter(
    (entry) =>
      settings.enabledPlugins[entry.id] === true &&
      !(entry.id.endsWith(officialSuffix) && suppressed.has(entry.id)),
  );
  const seen = new Set(records.map((entry) => entry.id));
  for (const cached of await scanOfficialPluginCacheRoots(join(cliRoot, "plugins"))) {
    const id = cached.name + officialSuffix;
    if (seen.has(id) || suppressed.has(id)) continue;
    const enabled = settings.enabledPlugins[id] ?? DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(id);
    if (!enabled) continue;
    for (const versionRoot of cached.versionRoots) {
      if ((await manifest(versionRoot))?.name !== cached.name) continue;
      active.push({ id, installPath: versionRoot, name: cached.name, scope: "user" });
      seen.add(id);
      break;
    }
  }
  return active;
}

async function agentPaths(plugin: InstalledPluginRecord): Promise<string[]> {
  const declared = (await manifest(plugin.installPath))?.agents;
  const root = resolve(plugin.installPath);
  const directories: string[] = [];
  function addDirectory(input: string): void {
    const target = resolve(root, input.replace(/^\.\//u, ""));
    const within = relative(root, target);
    if (within.startsWith("..") || isAbsolute(within)) return;
    if (!directories.includes(target)) directories.push(target);
  }
  addDirectory("agents");
  const extra = typeof declared === "string" ? [declared] : Array.isArray(declared) ? declared : [];
  for (const input of extra) {
    if (typeof input !== "string") continue;
    addDirectory(input);
  }
  return (await Promise.all(directories.map(collectMarkdown)))
    .flat()
    .sort((left, right) => left.localeCompare(right));
}

function applyOverride(
  agent: AgentSummary,
  overrides: PluginSubagentModelSelectionOverrides,
): AgentSummary {
  const copy = { ...agent, defaultModelSelection: agent.modelSelection };
  const override = overrides[agent.id];
  return override ? { ...copy, modelSelection: override, modelSelectionOverride: override } : copy;
}

export async function discoverPlugins(
  options: SubagentStorageOptions,
  overrides: PluginSubagentModelSelectionOverrides,
  reservedNames: Iterable<string>,
  diagnostics: AgentDiagnostic[],
): Promise<{ profiles: AgentSummary[]; runtimeAgents: AgentSummary[] }> {
  const profiles: AgentSummary[] = [];
  const bareNames = new Map<AgentSummary, string>();
  const counts = new Map<string, number>();
  for (const plugin of await activePlugins(options)) {
    for (const path of await agentPaths(plugin)) {
      try {
        const scope = plugin.scope === "workspace" ? "workspace" : "user";
        const parsed = parseSubagentMarkdown({
          content: await readFile(path, "utf-8"),
          path,
          scope,
        });
        if (parsed.diagnostic) {
          diagnostics.push(parsed.diagnostic);
          continue;
        }
        if (!parsed.agent) continue;
        const bareName = parsed.agent.name;
        const agent = applyOverride(
          {
            ...parsed.agent,
            id: createPluginAgentStateId(plugin.id, bareName),
            name: plugin.name + ":" + bareName,
            readOnly: true,
            source: "plugin",
            pluginId: plugin.id,
            pluginName: plugin.name,
            projectPath: scope === "workspace" ? plugin.projectPath : undefined,
          },
          overrides,
        );
        profiles.push(agent);
        bareNames.set(agent, bareName);
        counts.set(bareName, (counts.get(bareName) ?? 0) + 1);
      } catch {
        diagnostics.push({
          code: "agent_read_failed",
          message: "Failed to read plugin agent Markdown: " + path,
          path,
        });
      }
    }
  }
  const reserved = new Set<string>([...builtInNames, ...reservedNames]);
  const runtimeAgents: AgentSummary[] = [];
  for (const [agent, bareName] of bareNames) {
    runtimeAgents.push(agent);
    if (counts.get(bareName) === 1 && !reserved.has(bareName)) {
      runtimeAgents.push({
        ...agent,
        id: createPluginAgentStateId(agent.id + ":alias", bareName),
        name: bareName,
      });
    } else {
      diagnostics.push({
        code: "agent_ambiguous_name",
        message:
          (reserved.has(bareName)
            ? "Plugin agent bare name conflicts with an existing profile; use "
            : "Plugin agent bare name is ambiguous; use ") +
          agent.pluginName +
          ":" +
          bareName,
        path: agent.path,
      });
    }
  }
  profiles.sort((left, right) => left.name.localeCompare(right.name));
  runtimeAgents.sort((left, right) => left.name.localeCompare(right.name));
  return { profiles, runtimeAgents };
}
