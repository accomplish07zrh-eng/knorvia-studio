// Plugin reference catalog 的构建逻辑。
//
// 从 core 的 plugin-reference/catalog.ts 内联而来（kernel-switch 前置：该模块唯一的新引擎
// 消费者就是本目录的 plugin-reference-catalog.ts，而它的输入 outcome.plugins 来自
// bootstrap/src/plugins.ts —— 已经在新引擎侧，不依赖 core）。
//
// 为什么内联而不是移出到某个包：这段是 72 行纯函数（无 I/O、无状态、无运行时类依赖），
// 只用到 @knorvia/contracts 的三个类型。而 packages/shared 不依赖 contracts（反向是
// contracts → shared），放进去会形成循环依赖；contracts 是纯契约面，不放运行期实现。
// 所以按「协议层自己的职责」留在协议层。
import type {
  PluginMetadata,
  PluginReferenceCatalog,
  PluginReferenceCatalogEntry,
} from "@knorvia/contracts";

/** 同一 name 下出现过多个不同 id 时，这些 id 互为冲突（用于提示用户重名插件）。 */
function collectEnabledIdsByName(
  plugins: readonly PluginMetadata[],
): Map<string, Map<string, string[]>> {
  const enabledIds = new Map<string, Map<string, string[]>>();
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
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
  return enabledIds;
}

/** 从 components 里挑出 skill / agent 的限定名（`<pluginName>:<itemName>`）。 */
function collectQualifiedNames(plugin: PluginMetadata): { skills: string[]; agents: string[] } {
  const skills = new Set<string>();
  const agents = new Set<string>();
  for (const group of plugin.components) {
    if (group.kind !== "skill" && group.kind !== "agent") continue;
    const names = group.kind === "skill" ? skills : agents;
    for (const item of group.items) {
      const name = item.name.trim();
      if (name) names.add(`${plugin.name}:${name}`);
    }
  }
  return { skills: [...skills].sort(), agents: [...agents].sort() };
}

/** 同名的其他已启用插件 id（只对已启用的插件计算，并按 id 排序保证稳定）。 */
function collectConflictingIds(
  plugin: PluginMetadata,
  enabledIds: Map<string, Map<string, string[]>>,
): string[] {
  if (!plugin.enabled) return [];
  const conflictingPluginIds: string[] = [];
  for (const [id, occurrences] of enabledIds.get(plugin.name)!) {
    if (id === plugin.id) continue;
    for (const otherId of occurrences) conflictingPluginIds.push(otherId);
  }
  return conflictingPluginIds.sort();
}

/**
 * 把插件列表投影成引用目录：每个插件一条，带它声明的 skill / agent 限定名、
 * MCP server 名、以及同名的冲突插件 id。
 */
export function buildPluginReferenceCatalog(
  plugins: readonly PluginMetadata[],
): PluginReferenceCatalog {
  const enabledIds = collectEnabledIdsByName(plugins);
  return {
    plugins: plugins.map((plugin) => {
      const { skills, agents } = collectQualifiedNames(plugin);
      return {
        pluginId: plugin.id,
        name: plugin.name,
        marketplace: plugin.marketplace,
        enabled: plugin.enabled,
        conflictingPluginIds: collectConflictingIds(plugin, enabledIds),
        skillQualifiedNames: skills,
        mcpServerNames: [...plugin.mcpServerNames].sort(),
        subagentNames: agents,
        rootPath: plugin.rootPath,
      };
    }),
  };
}

/** 按 pluginId 查目录条目。 */
export function findPluginReferenceCatalogEntry(
  catalog: PluginReferenceCatalog | undefined,
  pluginId: string,
): PluginReferenceCatalogEntry | undefined {
  return catalog?.plugins.find((entry) => entry.pluginId === pluginId);
}
