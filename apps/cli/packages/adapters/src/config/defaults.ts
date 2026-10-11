// SPDX-License-Identifier: Apache-2.0
// 每个 ConfigKey 的默认值来源：惰性取 DefaultRuntimeConfig 的字段，避免导入期求值。
import { ConfigKey, DefaultRuntimeConfig as DefaultConfig } from "@knorvia/contracts";

/** 键 → 默认值取值器；顺序与 ConfigKey 的声明顺序无关，查找即命中。 */
const DEFAULT_SOURCES: ReadonlyArray<readonly [ConfigKey, () => unknown]> = [
  [ConfigKey.ModelStreamIdleTimeout, () => DefaultConfig.modelStream.idleTimeoutMs],
  [ConfigKey.PermissionMode, () => DefaultConfig.permission.mode],
  [ConfigKey.PermissionAllowedTools, () => DefaultConfig.permission.allowedTools],
  [ConfigKey.PermissionDisallowedTools, () => DefaultConfig.permission.disallowedTools],
  [ConfigKey.PermissionAutoApproveHighRisk, () => DefaultConfig.permission.autoApproveHighRisk],
  [ConfigKey.PermissionAllowMediumRiskInAuto, () => DefaultConfig.permission.allowMediumRiskInAuto],
  [ConfigKey.StorageDir, () => DefaultConfig.storage.dir],
  [ConfigKey.StorageSessionDbPath, () => DefaultConfig.storage.sessionDbPath],
  [ConfigKey.HttpProxy, () => DefaultConfig.network.httpProxy],
  [ConfigKey.NoProxy, () => DefaultConfig.network.noProxy],
  [ConfigKey.CaCertFile, () => DefaultConfig.network.caCertFile],
  [ConfigKey.HttpTimeout, () => DefaultConfig.network.timeout],
  [ConfigKey.FeatureCompact, () => DefaultConfig.features.compact],
  [ConfigKey.FeatureRewind, () => DefaultConfig.features.rewind],
  [ConfigKey.FeatureSubagent, () => DefaultConfig.features.subagent],
  [ConfigKey.FeatureMemory, () => DefaultConfig.features.memory],
  [ConfigKey.FeatureSkill, () => DefaultConfig.features.skill],
  [ConfigKey.FeatureMcp, () => DefaultConfig.features.mcp],
  [ConfigKey.MemoryUse, () => DefaultConfig.memory.use],
  [ConfigKey.McpServers, () => DefaultConfig.mcp.servers],
  [ConfigKey.PluginsEnabled, () => DefaultConfig.plugins.enabled],
  [ConfigKey.PluginsDirs, () => DefaultConfig.plugins.dirs],
  [ConfigKey.PluginsEnabledPlugins, () => DefaultConfig.plugins.enabledPlugins],
  [ConfigKey.PluginsExtraKnownMarketplaces, () => DefaultConfig.plugins.extraKnownMarketplaces],
  [ConfigKey.PluginsOptions, () => DefaultConfig.plugins.options],
  [ConfigKey.PluginsSuppressedBuiltins, () => DefaultConfig.plugins.suppressedBuiltins],
  [ConfigKey.SkillsEnabled, () => DefaultConfig.skills.enabled],
  [ConfigKey.SkillsIncludeInstructions, () => DefaultConfig.skills.includeInstructions],
  [ConfigKey.SkillsMetadataBudget, () => DefaultConfig.skills.metadataBudget],
  [ConfigKey.SkillsRoots, () => DefaultConfig.skills.roots],
  [ConfigKey.SkillOverrides, () => DefaultConfig.skillOverrides],
  [ConfigKey.CommandOverrides, () => DefaultConfig.commandOverrides],
  [ConfigKey.LogLevel, () => DefaultConfig.logging.level],
  [ConfigKey.LogFormat, () => DefaultConfig.logging.format],
  [ConfigKey.ToolConcurrencyMax, () => DefaultConfig.toolConcurrency.maxConcurrency],
  [ConfigKey.ModelAnomalyGuard, () => DefaultConfig.modelAnomalyGuard],
  [ConfigKey.Hooks, () => DefaultConfig.hooks],
  [ConfigKey.UiLocale, () => DefaultConfig.ui.locale],
  [ConfigKey.UiTheme, () => DefaultConfig.ui.theme],
];

const DEFAULTS: ReadonlyMap<ConfigKey, () => unknown> = new Map(DEFAULT_SOURCES);

export function getDefaultValue(key: ConfigKey): unknown {
  return DEFAULTS.get(key)?.();
}

export function hasDefaultValue(key: ConfigKey): boolean {
  return getDefaultValue(key) !== undefined;
}
