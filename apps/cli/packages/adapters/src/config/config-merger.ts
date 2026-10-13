// SPDX-License-Identifier: Apache-2.0
// 配置合并：按作用域优先级排序后逐层叠加，插件/钩子做逐项合并，其余按字段整体替换。
import type {
  HookEventName,
  HookMatcherConfig,
  PluginOptionValues,
  RuntimeConfigPatch,
} from "@knorvia/contracts";
import { ConfigScope, ConfigScopePriority } from "@knorvia/contracts";

/** 插件配置：按插件名索引的选项值表（契约只导出值类型，这里派生别名）。 */
type PluginOptions = Record<string, PluginOptionValues>;

/** 钩子配置：取「配置补丁」里 hooks 字段的非空类型，避免依赖不存在的导出名。 */
type RuntimeHooksConfig = NonNullable<RuntimeConfigPatch["hooks"]>;

interface PrioritizedConfig {
  config: RuntimeConfigPatch;
  scope: ConfigScope;
  priority: number;
}

/** 整体替换（浅拷贝）的字段名：合并语义就是「后者覆盖前者」。 */
const REPLACED_AS_A_WHOLE = [
  "modelStream",
  "permission",
  "storage",
  "network",
  "features",
  "memory",
  "skills",
  "skillOverrides",
  "commandOverrides",
  "logging",
  "toolConcurrency",
  "modelAnomalyGuard",
  "ui",
] as const satisfies readonly (keyof RuntimeConfigPatch)[];

export function getScopePriority(scope: ConfigScope): number {
  return ConfigScopePriority[scope];
}

export function createPrioritizedConfig(
  config: RuntimeConfigPatch,
  scope: ConfigScope,
): PrioritizedConfig {
  return { config, priority: getScopePriority(scope), scope };
}

/** mcp 需要二层拷贝：servers 是映射，不能与来源共享引用。 */
function mergeMcp(result: RuntimeConfigPatch, patch: RuntimeConfigPatch): void {
  const incoming = patch.mcp;
  if (incoming === undefined) return;
  const merged = { ...incoming };
  merged.servers = { ...incoming.servers };
  result.mcp = merged;
}

/** 项目作用域的插件声明不接受 `extraKnownMarketplaces`（该字段只在用户级生效）。 */
function pluginIncoming(
  patch: RuntimeConfigPatch,
  scope: ConfigScope,
): RuntimeConfigPatch["plugins"] {
  const declared = patch.plugins;
  if (declared === undefined || scope !== ConfigScope.Project) return declared;
  const trimmed = { ...declared };
  delete trimmed.extraKnownMarketplaces;
  return trimmed;
}

function mergePluginOptions(
  previous: PluginOptions | undefined,
  incoming: PluginOptions,
): PluginOptions {
  const merged: Record<string, PluginOptionValues> = { ...previous };
  for (const [plugin, values] of Object.entries(incoming)) {
    merged[plugin] = { ...merged[plugin], ...values };
  }
  return merged;
}

function mergePlugins(layer: {
  incomingPatch: RuntimeConfigPatch;
  previous: RuntimeConfigPatch["plugins"];
  result: RuntimeConfigPatch;
  scope: ConfigScope;
}): void {
  const { result } = layer;
  const previous = layer.previous;
  const incoming = pluginIncoming(layer.incomingPatch, layer.scope);
  if (incoming === undefined) {
    result.plugins = previous;
    return;
  }
  const plugins = { ...previous, ...incoming };
  if (incoming.dirs) plugins.dirs = [...new Set([...(previous?.dirs ?? []), ...incoming.dirs])];
  if (incoming.enabledPlugins) {
    plugins.enabledPlugins = { ...previous?.enabledPlugins, ...incoming.enabledPlugins };
  }
  if (incoming.extraKnownMarketplaces) {
    plugins.extraKnownMarketplaces = {
      ...previous?.extraKnownMarketplaces,
      ...incoming.extraKnownMarketplaces,
    };
  }
  if (incoming.options) plugins.options = mergePluginOptions(previous?.options, incoming.options);
  result.plugins = plugins;
}

/** 钩子：`enabled` 取两层的或；事件匹配器只在传入层未被显式关闭时追加。 */
function mergeHooks(layer: {
  incomingPatch: RuntimeConfigPatch;
  previous: RuntimeConfigPatch["hooks"];
  result: RuntimeConfigPatch;
}): void {
  const { result } = layer;
  const incoming = layer.incomingPatch.hooks;
  if (incoming === undefined) {
    result.hooks = layer.previous;
    return;
  }
  const previous = layer.previous;
  const events: RuntimeHooksConfig["events"] = { ...previous?.events };
  const merged = {
    ...previous,
    ...incoming,
    enabled: previous?.enabled === true || incoming.enabled === true,
    events,
  };
  if (incoming.enabled !== false && incoming.events) {
    const entries = Object.entries(incoming.events) as [
      HookEventName,
      HookMatcherConfig[] | undefined,
    ][];
    for (const [event, matchers] of entries) {
      if (!matchers) continue;
      merged.events[event] = [...(merged.events[event] ?? []), ...matchers];
    }
  }
  result.hooks = merged;
}

export function mergeConfigs(...configs: PrioritizedConfig[]): RuntimeConfigPatch {
  const ordered = [...configs].sort((left, right) => left.priority - right.priority);
  const merged: RuntimeConfigPatch = {};
  for (const layer of ordered) {
    const patch = layer.config;
    // 先记下这两项的旧值：Object.assign 会把它们整体覆盖掉。
    const previousPlugins = merged.plugins;
    const previousHooks = merged.hooks;
    Object.assign(merged, patch);
    for (const key of REPLACED_AS_A_WHOLE) {
      const value = patch[key];
      if (value !== undefined) Object.assign(merged, { [key]: { ...value } });
    }
    mergeMcp(merged, patch);
    mergePlugins({
      incomingPatch: patch,
      previous: previousPlugins,
      result: merged,
      scope: layer.scope,
    });
    mergeHooks({ incomingPatch: patch, previous: previousHooks, result: merged });
  }
  return merged;
}
