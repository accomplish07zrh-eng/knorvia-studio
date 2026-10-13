// SPDX-License-Identifier: Apache-2.0
// 配置存储：按 ConfigKey 记账（值 + 来源），并把补丁按固定条目表归约进存储。
import {
  ConfigKey,
  ConfigScope,
  DefaultRuntimeConfig as DefaultConfig,
  type ConfigObserver,
  type ConfigSource,
  type ConfigValue,
  type RuntimeConfigPatch,
  type Unsubscribe,
} from "@knorvia/contracts";

type Subscriber<K extends ConfigKey> = (value: ConfigValue<K>, prev: ConfigValue<K>) => void;
export type AllHandler = (key: ConfigKey, value: unknown, prev: unknown) => void;

interface Slice {
  held: unknown;
  provenance: ConfigSource[];
}

interface PatchRoute {
  key: ConfigKey;
  pick: (patch: RuntimeConfigPatch) => unknown;
  /** 该键只接受「真值」：空串会被跳过（与其余键的 `!== undefined` 判定不同）。 */
  truthy?: true;
}

/**
 * 补丁 → 键的固定归约表；顺序即通知顺序（观察者可能依赖它）。
 * 判空差异按冻结语义保留：permission.mode/allowedTools/disallowedTools、storage.dir/
 * sessionDbPath、logging.level 用真值判断，其余键用 `!== undefined`。
 */
const PATCH_ROUTES: readonly PatchRoute[] = [
  { key: ConfigKey.ModelStreamIdleTimeout, pick: (patch) => patch.modelStream?.idleTimeoutMs },
  { key: ConfigKey.PermissionMode, pick: (patch) => patch.permission?.mode, truthy: true },
  {
    key: ConfigKey.PermissionAllowedTools,
    pick: (patch) => patch.permission?.allowedTools,
    truthy: true,
  },
  {
    key: ConfigKey.PermissionDisallowedTools,
    pick: (patch) => patch.permission?.disallowedTools,
    truthy: true,
  },
  {
    key: ConfigKey.PermissionAutoApproveHighRisk,
    pick: (patch) => patch.permission?.autoApproveHighRisk,
  },
  {
    key: ConfigKey.PermissionAllowMediumRiskInAuto,
    pick: (patch) => patch.permission?.allowMediumRiskInAuto,
  },
  { key: ConfigKey.StorageDir, pick: (patch) => patch.storage?.dir, truthy: true },
  {
    key: ConfigKey.StorageSessionDbPath,
    pick: (patch) => patch.storage?.sessionDbPath,
    truthy: true,
  },
  { key: ConfigKey.HttpProxy, pick: (patch) => patch.network?.httpProxy },
  { key: ConfigKey.NoProxy, pick: (patch) => patch.network?.noProxy },
  { key: ConfigKey.CaCertFile, pick: (patch) => patch.network?.caCertFile },
  { key: ConfigKey.HttpTimeout, pick: (patch) => patch.network?.timeout },
  { key: ConfigKey.FeatureCompact, pick: (patch) => patch.features?.compact },
  { key: ConfigKey.FeatureRewind, pick: (patch) => patch.features?.rewind },
  { key: ConfigKey.FeatureSubagent, pick: (patch) => patch.features?.subagent },
  { key: ConfigKey.FeatureMemory, pick: (patch) => patch.features?.memory },
  { key: ConfigKey.FeatureSkill, pick: (patch) => patch.features?.skill },
  { key: ConfigKey.FeatureMcp, pick: (patch) => patch.features?.mcp },
  { key: ConfigKey.MemoryUse, pick: (patch) => patch.memory?.use },
  { key: ConfigKey.McpServers, pick: (patch) => patch.mcp?.servers },
  { key: ConfigKey.PluginsEnabled, pick: (patch) => patch.plugins?.enabled },
  { key: ConfigKey.PluginsDirs, pick: (patch) => patch.plugins?.dirs },
  { key: ConfigKey.PluginsEnabledPlugins, pick: (patch) => patch.plugins?.enabledPlugins },
  {
    key: ConfigKey.PluginsExtraKnownMarketplaces,
    pick: (patch) => patch.plugins?.extraKnownMarketplaces,
  },
  { key: ConfigKey.PluginsOptions, pick: (patch) => patch.plugins?.options },
  { key: ConfigKey.PluginsSuppressedBuiltins, pick: (patch) => patch.plugins?.suppressedBuiltins },
  { key: ConfigKey.SkillsEnabled, pick: (patch) => patch.skills?.enabled },
  { key: ConfigKey.SkillsIncludeInstructions, pick: (patch) => patch.skills?.includeInstructions },
  { key: ConfigKey.SkillsMetadataBudget, pick: (patch) => patch.skills?.metadataBudget },
  { key: ConfigKey.SkillsRoots, pick: (patch) => patch.skills?.roots },
  { key: ConfigKey.SkillOverrides, pick: (patch) => patch.skillOverrides },
  { key: ConfigKey.CommandOverrides, pick: (patch) => patch.commandOverrides },
  { key: ConfigKey.LogLevel, pick: (patch) => patch.logging?.level, truthy: true },
  { key: ConfigKey.LogFormat, pick: (patch) => patch.logging?.format },
  { key: ConfigKey.ToolConcurrencyMax, pick: (patch) => patch.toolConcurrency?.maxConcurrency },
  { key: ConfigKey.UiLocale, pick: (patch) => patch.ui?.locale },
  { key: ConfigKey.UiTheme, pick: (patch) => patch.ui?.theme },
];

export class ConfigStore {
  private readonly slots = new Map<ConfigKey, Slice>();
  private readonly listeners = new Map<ConfigKey, Set<Subscriber<never>>>();
  private readonly broadcast = new Set<AllHandler>();

  constructor(seed?: RuntimeConfigPatch) {
    if (seed) this.merge(seed, ConfigScope.System);
  }

  get<K extends ConfigKey>(slot: K): ConfigValue<K> | undefined {
    return this.slots.get(slot)?.held as ConfigValue<K>;
  }

  has(which: ConfigKey): boolean {
    return this.slots.has(which);
  }

  /** 写入单键并通知订阅者：值变化后先发该键的处理器，再发全量处理器。 */
  set<K extends ConfigKey>(
    key: K,
    value: ConfigValue<K>,
    scope: ConfigScope,
    source?: string,
  ): void {
    const before = this.get(key);
    const slice = { held: value, provenance: [{ key, path: source, scope, value }] } as Slice;
    this.slots.set(key, slice);
    this.listeners.get(key)?.forEach((notify) => notify(value as never, before as never));
    this.broadcast.forEach((notify) => notify(key, value, before as never));
  }

  getSources(of: ConfigKey): ConfigSource[] {
    return this.slots.get(of)?.provenance ?? [];
  }

  /** 归约：先按表搬运同名键，再处理两个需要与旧值合并的键（异常守卫、hooks）。 */
  merge(patch: RuntimeConfigPatch, scope: ConfigScope): void {
    for (const route of PATCH_ROUTES) {
      const value = route.pick(patch);
      const accepted = route.truthy === true ? Boolean(value) : value !== undefined;
      if (accepted) this.set(route.key, value as never, scope);
    }

    if (patch.modelAnomalyGuard !== undefined) {
      const current = this.get(ConfigKey.ModelAnomalyGuard) ?? DefaultConfig.modelAnomalyGuard;
      this.set(ConfigKey.ModelAnomalyGuard, { ...current, ...patch.modelAnomalyGuard }, scope);
    }

    if (patch.hooks !== undefined) {
      const current = this.get(ConfigKey.Hooks) ?? DefaultConfig.hooks;
      const merged = { ...current, ...patch.hooks, events: patch.hooks.events ?? current.events };
      this.set(ConfigKey.Hooks, merged, scope);
    }
  }

  subscribe<K extends ConfigKey>(which: K, subscriber: Subscriber<K>): Unsubscribe {
    const group = this.listeners.get(which) ?? new Set<Subscriber<never>>();
    this.listeners.set(which, group);
    group.add(subscriber as Subscriber<never>);
    return (): void => {
      this.listeners.get(which)?.delete(subscriber as Subscriber<never>);
    };
  }

  subscribeAll(subscriber: AllHandler): Unsubscribe {
    this.broadcast.add(subscriber);
    return (): void => {
      this.broadcast.delete(subscriber);
    };
  }
}

export type { ConfigObserver };
