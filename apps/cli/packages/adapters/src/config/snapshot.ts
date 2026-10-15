// SPDX-License-Identifier: Apache-2.0
// 运行态快照：存储值优先，缺席时退回默认值（部分键的默认值是常量 true/info）。
import {
  ConfigKey,
  DefaultRuntimeConfig as DefaultConfig,
  type RuntimeConfig,
} from "@knorvia/contracts";
import type { ConfigStore } from "./store.js";

/** 三个常量型默认值：特性开关与技能开关默认打开，日志级别默认 info。 */
const FEATURE_ON = true;
const SKILLS_ON = true;
const DEFAULT_LOG_LEVEL = "info";

// network 的三项（httpProxy/noProxy/caCertFile）没有默认值，必须区分「未设置」与「默认值」：
// 前者用 stored() 读取，后者用 withDefault() 兜底；plugins/skills/storage/permission 的
// 字段都来自 DefaultRuntimeConfig，因此统一走 withDefault()。
// 快照里每个键都必须出现（调用方按字段访问，不做存在性判断）。
// 读取两个 helper 的分工：stored() 只取值、withDefault() 负责兜底；两者都不写入存储。
// 快照是「本次读取的视图」，不订阅变更——需要变更通知请用 ConfigPort.observe()。

export function buildRuntimeConfig(store: ConfigStore): RuntimeConfig {
  const stored = <T>(key: ConfigKey): T | undefined => store.get(key) as T | undefined;
  const withDefault = <T>(key: ConfigKey, fallback: T): T => stored<T>(key) ?? fallback;
  const permission = DefaultConfig.permission;
  const storage = DefaultConfig.storage;
  const network = DefaultConfig.network;
  const plugins = DefaultConfig.plugins;
  const skills = DefaultConfig.skills;

  return {
    modelStream: {
      idleTimeoutMs: withDefault(
        ConfigKey.ModelStreamIdleTimeout,
        DefaultConfig.modelStream.idleTimeoutMs,
      ),
    },
    permission: {
      mode: withDefault(ConfigKey.PermissionMode, permission.mode),
      allowedTools: withDefault(ConfigKey.PermissionAllowedTools, permission.allowedTools),
      disallowedTools: withDefault(ConfigKey.PermissionDisallowedTools, permission.disallowedTools),
      autoApproveHighRisk: withDefault(
        ConfigKey.PermissionAutoApproveHighRisk,
        permission.autoApproveHighRisk,
      ),
      allowMediumRiskInAuto: withDefault(
        ConfigKey.PermissionAllowMediumRiskInAuto,
        permission.allowMediumRiskInAuto,
      ),
    },
    storage: {
      dir: withDefault(ConfigKey.StorageDir, storage.dir),
      sessionDbPath: withDefault(ConfigKey.StorageSessionDbPath, storage.sessionDbPath),
    },
    network: {
      httpProxy: stored(ConfigKey.HttpProxy),
      noProxy: stored(ConfigKey.NoProxy),
      caCertFile: stored(ConfigKey.CaCertFile),
      timeout: withDefault(ConfigKey.HttpTimeout, network.timeout),
    },
    features: {
      compact: withDefault(ConfigKey.FeatureCompact, FEATURE_ON),
      rewind: withDefault(ConfigKey.FeatureRewind, FEATURE_ON),
      subagent: withDefault(ConfigKey.FeatureSubagent, FEATURE_ON),
      memory: withDefault(ConfigKey.FeatureMemory, FEATURE_ON),
      skill: withDefault(ConfigKey.FeatureSkill, FEATURE_ON),
      mcp: withDefault(ConfigKey.FeatureMcp, FEATURE_ON),
    },
    memory: { use: withDefault(ConfigKey.MemoryUse, DefaultConfig.memory.use) },
    mcp: { servers: withDefault(ConfigKey.McpServers, DefaultConfig.mcp.servers) },
    plugins: {
      dirs: withDefault(ConfigKey.PluginsDirs, plugins.dirs),
      enabled: withDefault(ConfigKey.PluginsEnabled, plugins.enabled),
      enabledPlugins: withDefault(ConfigKey.PluginsEnabledPlugins, plugins.enabledPlugins),
      extraKnownMarketplaces: withDefault(
        ConfigKey.PluginsExtraKnownMarketplaces,
        plugins.extraKnownMarketplaces,
      ),
      options: withDefault(ConfigKey.PluginsOptions, plugins.options),
      suppressedBuiltins: withDefault(
        ConfigKey.PluginsSuppressedBuiltins,
        plugins.suppressedBuiltins,
      ),
    },
    skills: {
      enabled: withDefault(ConfigKey.SkillsEnabled, SKILLS_ON),
      includeInstructions: withDefault(ConfigKey.SkillsIncludeInstructions, SKILLS_ON),
      metadataBudget: withDefault(ConfigKey.SkillsMetadataBudget, skills.metadataBudget),
      roots: withDefault(ConfigKey.SkillsRoots, skills.roots),
    },
    skillOverrides: withDefault(ConfigKey.SkillOverrides, DefaultConfig.skillOverrides),
    commandOverrides: withDefault(ConfigKey.CommandOverrides, DefaultConfig.commandOverrides),
    logging: {
      level: withDefault(ConfigKey.LogLevel, DEFAULT_LOG_LEVEL),
      format: withDefault(ConfigKey.LogFormat, DefaultConfig.logging.format),
    },
    toolConcurrency: {
      maxConcurrency: withDefault(
        ConfigKey.ToolConcurrencyMax,
        DefaultConfig.toolConcurrency.maxConcurrency,
      ),
    },
    modelAnomalyGuard: withDefault(ConfigKey.ModelAnomalyGuard, DefaultConfig.modelAnomalyGuard),
    hooks: withDefault(ConfigKey.Hooks, DefaultConfig.hooks),
    ui: {
      locale: withDefault(ConfigKey.UiLocale, DefaultConfig.ui.locale),
      theme: withDefault(ConfigKey.UiTheme, DefaultConfig.ui.theme),
    },
  };
}
