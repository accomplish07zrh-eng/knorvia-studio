// 配置端口：带变更通知的分层配置。

import type { CollaborationMode } from "../interfaces/session.port.js";
import type { McpServerConfig } from "../interfaces/mcp.port.js";
import type { HooksRuntimeConfig, HooksRuntimeConfigPatch } from "../hooks/index.js";
import type { PluginConfig, PluginOptionValues } from "../plugins/index.js";

// 配置键

/** 配置键表：`[常量键, 配置键]` 逐行一组；顺序即既有声明顺序，分组注释保留域信息。 */
const CONFIG_KEY_ENTRIES = [
  ["ModelStreamIdleTimeout", "modelStream.idleTimeoutMs"],
  // 权限
  ["PermissionMode", "permission.mode"],
  ["PermissionAllowedTools", "permission.allowedTools"],
  ["PermissionDisallowedTools", "permission.disallowedTools"],
  ["PermissionAutoApproveHighRisk", "permission.autoApproveHighRisk"],
  ["PermissionAllowMediumRiskInAuto", "permission.allowMediumRiskInAuto"],
  // 存储
  ["StorageDir", "storage.dir"],
  ["StorageSessionDbPath", "storage.sessionDbPath"],
  // 网络
  ["HttpProxy", "network.httpProxy"],
  ["NoProxy", "network.noProxy"],
  ["CaCertFile", "network.caCertFile"],
  ["HttpTimeout", "network.timeout"],
  // 功能开关
  ["FeatureCompact", "features.compact"],
  ["FeatureRewind", "features.rewind"],
  ["FeatureSubagent", "features.subagent"],
  ["FeatureMemory", "features.memory"],
  ["FeatureSkill", "features.skill"],
  ["FeatureMcp", "features.mcp"],
  // 记忆
  ["MemoryUse", "memory.use"],
  // MCP 服务
  ["McpServers", "mcp.servers"],
  // 插件
  ["PluginsEnabled", "plugins.enabled"],
  ["PluginsDirs", "plugins.dirs"],
  ["PluginsEnabledPlugins", "plugins.enabledPlugins"],
  ["PluginsExtraKnownMarketplaces", "plugins.extraKnownMarketplaces"],
  ["PluginsOptions", "plugins.options"],
  ["PluginsSuppressedBuiltins", "plugins.suppressedBuiltins"],
  // 技能
  ["SkillsEnabled", "skills.enabled"],
  ["SkillsIncludeInstructions", "skills.includeInstructions"],
  ["SkillsMetadataBudget", "skills.metadataBudget"],
  ["SkillsRoots", "skills.roots"],
  // 技能与命令覆盖（按 SKILL.md / 命令 .md 的绝对路径过滤）
  ["SkillOverrides", "skill"],
  ["CommandOverrides", "command"],
  // 日志
  ["LogLevel", "logging.level"],
  ["LogFormat", "logging.format"],
  // 工具并发
  ["ToolConcurrencyMax", "toolConcurrency.maxConcurrency"],
  // 模型异常守卫
  ["ModelAnomalyGuard", "modelAnomalyGuard"],
  // Hooks 配置
  ["Hooks", "hooks"],
  // 界面
  ["UiLocale", "ui.locale"],
  ["UiTheme", "ui.theme"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

/** 配置键的字面量联合，由键表推导。 */
export type ConfigKey = (typeof CONFIG_KEY_ENTRIES)[number][1];

/** 常量对象类型，由键表推导：键 → 配置键字面量。 */
type ConfigKeyTable = {
  readonly [Entry in (typeof CONFIG_KEY_ENTRIES)[number] as Entry[0]]: Entry[1];
};

export const ConfigKey = Object.fromEntries(CONFIG_KEY_ENTRIES) as unknown as ConfigKeyTable;

// 配置值类型

export type ConfigValue<K extends ConfigKey> = K extends "modelStream.idleTimeoutMs"
  ? number
  : K extends "permission.mode"
    ? CollaborationMode
    : K extends "permission.allowedTools" | "permission.disallowedTools"
      ? string[]
      : K extends "permission.autoApproveHighRisk" | "permission.allowMediumRiskInAuto"
        ? boolean
        : K extends
              | "storage.dir"
              | "storage.sessionDbPath"
              | "network.httpProxy"
              | "network.noProxy"
              | "network.caCertFile"
          ? string | undefined
          : K extends "network.timeout"
            ? number
            : K extends
                  | "features.compact"
                  | "features.rewind"
                  | "features.subagent"
                  | "features.memory"
                  | "features.skill"
                  | "features.mcp"
                  | "skills.enabled"
                  | "skills.includeInstructions"
              ? boolean
              : K extends "memory.use"
                ? boolean
                : K extends "skills.metadataBudget"
                  ? number
                  : K extends "skills.roots"
                    ? string[]
                    : K extends "skill" | "command"
                      ? Record<string, SkillCommandOverride>
                      : K extends "mcp.servers"
                        ? Record<string, McpServerConfig>
                        : K extends "plugins.enabled"
                          ? boolean
                          : K extends "plugins.dirs"
                            ? string[]
                            : K extends "plugins.enabledPlugins"
                              ? Record<string, boolean>
                              : K extends "plugins.extraKnownMarketplaces"
                                ? PluginConfig["extraKnownMarketplaces"]
                                : K extends "plugins.options"
                                  ? Record<string, PluginOptionValues>
                                  : K extends "plugins.suppressedBuiltins"
                                    ? string[]
                                    : K extends "logging.level"
                                      ? "debug" | "info" | "warn" | "error"
                                      : K extends "logging.format"
                                        ? "text" | "json"
                                        : K extends "toolConcurrency.maxConcurrency"
                                          ? number
                                          : K extends "modelAnomalyGuard"
                                            ? ModelAnomalyGuardConfig
                                            : K extends "hooks"
                                              ? HooksRuntimeConfig
                                              : K extends "ui.locale"
                                                ? UiLocale
                                                : K extends "ui.theme"
                                                  ? UiThemePreference
                                                  : unknown;

// 配置作用域

/** 配置作用域取值清单；常量表与联合都由它推出。 */
const CONFIG_SCOPE_NAMES = ["system", "user", "project", "session", "env", "cli"] as const;

export const ConfigScope = Object.fromEntries(
  CONFIG_SCOPE_NAMES.map((value) => [value.charAt(0).toUpperCase() + value.slice(1), value]),
) as unknown as {
  readonly System: "system";
  readonly User: "user";
  readonly Project: "project";
  readonly Session: "session";
  readonly Env: "env";
  readonly Cli: "cli";
};

export type ConfigScope = (typeof CONFIG_SCOPE_NAMES)[number];

export const ConfigScopePriority: Record<ConfigScope, number> = {
  [ConfigScope.System]: 0,
  [ConfigScope.User]: 10,
  [ConfigScope.Project]: 20,
  [ConfigScope.Session]: 30,
  [ConfigScope.Env]: 40,
  [ConfigScope.Cli]: 50,
};

// 配置来源

export interface ConfigSource {
  scope: ConfigScope;
  key: ConfigKey;
  value: unknown;
  path?: string; // For file-based configs, the file path
}

// 技能与命令覆盖

// 按绝对路径覆盖单个 skill / 命令是否可用。未列出的条目默认可用，
// 发现阶段只过滤显式 enable:false 的条目。
export interface SkillCommandOverride {
  enable?: boolean;
}

// Runtime Config

export interface RuntimeConfig {
  modelStream: ModelStreamConfig;
  permission: {
    mode: CollaborationMode;
    allowedTools: string[];
    disallowedTools: string[];
    autoApproveHighRisk: boolean;
    allowMediumRiskInAuto: boolean;
  };
  storage: {
    dir: string;
    sessionDbPath: string;
  };
  network: {
    httpProxy?: string;
    noProxy?: string;
    caCertFile?: string;
    timeout: number;
  };
  features: {
    compact: boolean;
    rewind: boolean;
    subagent: boolean;
    memory: boolean;
    skill: boolean;
    mcp: boolean;
  };
  memory: {
    use: boolean;
  };
  mcp: {
    servers: Record<string, McpServerConfig>;
  };
  plugins: PluginConfig;
  skills: {
    enabled: boolean;
    includeInstructions: boolean;
    metadataBudget: number;
    roots: string[];
    [skillPath: string]: boolean | number | string[] | { enable?: boolean };
  };
  // key 为 SKILL.md 绝对路径，value.enable=false 表示禁用该 skill
  skillOverrides: Record<string, SkillCommandOverride>;
  // key 为命令 .md 绝对路径，value.enable=false 表示禁用该命令
  commandOverrides: Record<string, SkillCommandOverride>;
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "text" | "json";
  };
  toolConcurrency: ToolConcurrencyConfig;
  modelAnomalyGuard: ModelAnomalyGuardConfig;
  hooks: HooksRuntimeConfig;
  ui: {
    locale: UiLocale;
    theme: UiThemePreference;
  };
}

export interface RuntimeConfigPatch {
  modelStream?: Partial<ModelStreamConfig>;
  permission?: Partial<RuntimeConfig["permission"]>;
  storage?: Partial<RuntimeConfig["storage"]>;
  network?: Partial<RuntimeConfig["network"]>;
  features?: Partial<RuntimeConfig["features"]>;
  memory?: Partial<RuntimeConfig["memory"]>;
  mcp?: Partial<RuntimeConfig["mcp"]>;
  plugins?: Partial<RuntimeConfig["plugins"]>;
  skills?: Partial<RuntimeConfig["skills"]>;
  skillOverrides?: RuntimeConfig["skillOverrides"];
  commandOverrides?: RuntimeConfig["commandOverrides"];
  logging?: Partial<RuntimeConfig["logging"]>;
  toolConcurrency?: Partial<RuntimeConfig["toolConcurrency"]>;
  modelAnomalyGuard?: Partial<RuntimeConfig["modelAnomalyGuard"]>;
  hooks?: HooksRuntimeConfigPatch;
  ui?: Partial<RuntimeConfig["ui"]>;
}

export type SupportedLocale = "en-US" | "zh-CN";
export type UiLocale = SupportedLocale | "auto";
export type UiThemeMode = "dark" | "light";
export type UiThemePreference = UiThemeMode | "auto";

export const DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS = 600_000;

export interface ModelStreamConfig {
  idleTimeoutMs: number;
}

/** 默认运行配置的逐字段默认值：`[点分路径, 默认值]`；顺序即嵌套对象的键顺序。 */
const RUNTIME_CONFIG_DEFAULTS: ReadonlyArray<readonly [string, unknown]> = [
  ["modelStream.idleTimeoutMs", DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS],
  ["permission.mode", "build"],
  ["permission.allowedTools", []],
  ["permission.disallowedTools", []],
  ["permission.autoApproveHighRisk", false],
  ["permission.allowMediumRiskInAuto", false],
  ["storage.dir", "~/.knorvia-studio"],
  ["storage.sessionDbPath", "~/.knorvia-studio/cli/db/db.sqlite"],
  ["network.timeout", 180_000],
  ["features.compact", true],
  ["features.rewind", true],
  ["features.subagent", true],
  ["features.memory", true],
  ["features.skill", true],
  ["features.mcp", true],
  ["memory.use", true],
  ["mcp.servers", {}],
  ["plugins.dirs", []],
  ["plugins.enabled", true],
  ["plugins.enabledPlugins", {}],
  ["plugins.extraKnownMarketplaces", {}],
  ["plugins.options", {}],
  ["plugins.suppressedBuiltins", []],
  ["skills.enabled", true],
  ["skills.includeInstructions", true],
  ["skills.metadataBudget", 20_000],
  ["skills.roots", []],
  ["skillOverrides", {}],
  ["commandOverrides", {}],
  ["logging.level", "info"],
  ["logging.format", "text"],
  ["toolConcurrency.maxConcurrency", 10],
  ["modelAnomalyGuard.maxBudgetWarningsPerTurn", 3],
  ["modelAnomalyGuard.repeatedToolCallWarningThreshold", 3],
  ["hooks.enabled", false],
  ["hooks.events", {}],
  ["hooks.maxOutputBytes", 32_768],
  ["hooks.timeoutMs", 60_000],
  ["ui.locale", "en-US"],
  ["ui.theme", "auto"],
];

/** 按点分路径把默认值表铺成嵌套对象；同层键顺序即表里的出现顺序。 */
function buildRuntimeConfigDefaults(
  entries: ReadonlyArray<readonly [string, unknown]>,
): RuntimeConfig {
  const config: Record<string, unknown> = {};
  for (const [path, value] of entries) {
    const segments = path.split(".");
    const leaf = segments[segments.length - 1] as string;
    let cursor = config;
    for (const segment of segments.slice(0, -1)) {
      const existing = cursor[segment];
      if (typeof existing !== "object" || existing === null) {
        const nested: Record<string, unknown> = {};
        cursor[segment] = nested;
        cursor = nested;
      } else {
        cursor = existing as Record<string, unknown>;
      }
    }
    cursor[leaf] = value;
  }
  return config as unknown as RuntimeConfig;
}

export const DefaultRuntimeConfig: RuntimeConfig =
  buildRuntimeConfigDefaults(RUNTIME_CONFIG_DEFAULTS);

// 工具并发 Config

export interface ToolConcurrencyConfig {
  maxConcurrency: number;
}

export interface ModelAnomalyGuardConfig {
  toolCallWarningThreshold?: number;
  repeatedToolCallWarningThreshold: number;
  maxBudgetWarningsPerTurn: number;
}

// Config Port Interface

export interface Unsubscribe {
  (): void;
}

export interface ConfigObserver {
  subscribe<K extends ConfigKey>(
    key: K,
    handler: (value: ConfigValue<K>, prev: ConfigValue<K>) => void,
  ): Unsubscribe;
  subscribeAll(handler: (key: ConfigKey, value: unknown, prev: unknown) => void): Unsubscribe;
}

export interface ConfigPort {
  // Get configuration value
  get<K extends ConfigKey>(key: K): ConfigValue<K>;
  getAll(): RuntimeConfig;

  // Check if key exists
  has(key: ConfigKey): boolean;

  // Set configuration value (runtime only, not persisted by default)
  set<K extends ConfigKey>(key: K, value: ConfigValue<K>): void;

  // Get observer for scoped subscriptions
  observe(): ConfigObserver;

  // Get all sources for a key (for debugging/audit)
  getSources(key: ConfigKey): ConfigSource[];

  // Merge additional config (e.g., from file/env)
  merge(config: RuntimeConfigPatch, scope: ConfigScope): void;
}
