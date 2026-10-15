// SPDX-License-Identifier: Apache-2.0
// 插件市场与插件清单的共享类型（纯声明）。
export type PluginMarketplaceSummary = {
  id: /* 市场标识 */ string;
  name: /* 市场名 */ string;
  source: /* 来源描述 */ string;
  installLocation?: /* 安装位置 */ string;
  lastUpdated?: /* 最近更新时间文本 */ string;
  pluginCount: /* 插件数量 */ number;
  description?: /* 描述 */ string;
  isOfficial: /* 是否官方市场 */ boolean;
};

const COMPONENT_TYPE_TABLE = {
  agent: "agent",
  command: "command",
  skill: "skill",
  hook: "hook",
  mcp: "mcp",
  lsp: "lsp",
} as const;
export type PluginComponentType = (typeof COMPONENT_TYPE_TABLE)[keyof typeof COMPONENT_TYPE_TABLE];

const PLUGIN_SCOPE_TABLE = { workspace: "workspace", user: "user" } as const;
export type PluginScope = (typeof PLUGIN_SCOPE_TABLE)[keyof typeof PLUGIN_SCOPE_TABLE];

export type PluginHookDetail = {
  args?: /* 参数列表 */ string[];
  async?: /* 是否异步 */ boolean;
  command: /* 命令 */ string;
  event: /* 触发事件名 */ string;
  matcher?: /* 工具名匹配串 */ string;
  runnable: /* 是否可运行 */ boolean;
  shell?: /* shell 形态开关或解释器 */ true | string;
  sourcePath: /* 声明文件路径 */ string;
  statusMessage?: /* 状态文案 */ string;
  timeout?: /* 超时（旧字段） */ number;
  timeoutMs?: /* 超时毫秒 */ number;
  type: /* 实现形态 */ "command" | "process";
};

export type AvailablePluginSummary = {
  id: /* 插件完整 ID */ string;
  name: /* 插件名 */ string;
  marketplace: /* 所属市场 */ string;
  description?: /* 描述 */ string;
  version?: /* 版本 */ string;
  installed: /* 是否已安装 */ boolean;
  componentTypes?: /* 组件构成 */ PluginComponentType[];
};

export type InstalledPluginSummary = {
  id: /* 插件完整 ID */ string;
  name: /* 插件名 */ string;
  marketplace: /* 所属市场 */ string;
  description?: /* 描述 */ string;
  version?: /* 版本 */ string;
  enabled: /* 是否启用 */ boolean;
  scope: /* 安装层级 */ PluginScope;
  installPath?: /* 安装路径 */ string;
  nativeScope?: /* 原生目录层级 */ "user" | "project" | "local";
  projectPath?: /* 项目级插件的项目路径 */ string;
  installedAt?: /* 安装时间文本 */ string;
  componentTypes?: /* 组件构成 */ PluginComponentType[];
  hookDetails?: /* hook 明细 */ PluginHookDetail[];
};

export type PluginsCapability = {
  supported: /* 是否支持插件能力 */ boolean;
  reason?: /* 不支持原因 */ "desktop_only" | "missing_cli";
};

export type PluginsOverviewResult = {
  marketplaces: /* 市场列表 */ PluginMarketplaceSummary[];
  availablePlugins: /* 可装插件 */ AvailablePluginSummary[];
  installedPlugins: /* 已装插件 */ InstalledPluginSummary[];
  capability: /* 能力说明 */ PluginsCapability;
};
