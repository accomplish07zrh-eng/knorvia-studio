import type {
  PluginMetadata,
  PluginReferenceCatalog,
  PluginReferenceCatalogEntry,
} from "@knorvia/contracts";

export function buildPluginReferenceCatalog(
  plugins: readonly PluginMetadata[],
): PluginReferenceCatalog {
  const enabledIds = new Map<string, Map<string, string[]>>();
  for (const plugin of plugins) {
    if (!plugin.enabled) {
      continue;
    }
    let ids = enabledIds.get(plugin.name);
    if (!ids) {
      ids = new Map<string, string[]>();
      enabledIds.set(plugin.name, ids);
    }
    let occurrences = ids.get(plugin.id);
    if (!occurrences) {
      occurrences = [];
      ids.set(plugin.id, occurrences);
    }
    occurrences.push(plugin.id);
  }

  return {
    plugins: plugins.map((plugin) => {
      const skills = new Set<string>();
      const agents = new Set<string>();

      for (const group of plugin.components) {
        if (group.kind !== "skill" && group.kind !== "agent") {
          continue;
        }
        const names = group.kind === "skill" ? skills : agents;
        for (const item of group.items) {
          const name = item.name.trim();
          if (name) {
            names.add(`${plugin.name}:${name}`);
          }
        }
      }

      const conflictingPluginIds: string[] = [];
      if (plugin.enabled) {
        for (const [id, occurrences] of enabledIds.get(plugin.name)!) {
          if (id !== plugin.id) {
            for (const otherId of occurrences) {
              conflictingPluginIds.push(otherId);
            }
          }
        }
        conflictingPluginIds.sort();
      }

      return {
        pluginId: plugin.id,
        name: plugin.name,
        marketplace: plugin.marketplace,
        enabled: plugin.enabled,
        conflictingPluginIds,
        skillQualifiedNames: [...skills].sort(),
        mcpServerNames: [...plugin.mcpServerNames].sort(),
        subagentNames: [...agents].sort(),
        rootPath: plugin.rootPath,
      };
    }),
  };
}

export function findPluginReferenceCatalogEntry(
  catalog: PluginReferenceCatalog | undefined,
  pluginId: string,
): PluginReferenceCatalogEntry | undefined {
  return catalog?.plugins.find((entry) => entry.pluginId === pluginId);
}
