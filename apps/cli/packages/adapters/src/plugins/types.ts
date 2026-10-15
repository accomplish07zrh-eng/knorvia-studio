// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  CustomCommandRoot,
  HookEventName,
  HookMatcherConfig,
  McpServerConfig,
  PluginHookDetail,
  PluginManifest,
  PluginSource,
  SkillRoot,
} from "@knorvia/contracts";

export interface /* 候选插件 */ PluginCandidate {
  defaultEnabled: /* 默认是否启用 */ boolean;
  marketplace: /* 所属市场标识 */ string;
  rootPath: string;
  source: /* 插件来源 */ PluginSource;
}
export interface /* 已加载插件 */ LoadedPlugin {
  id: string;
  manifest: /* 插件清单 */ PluginManifest;
  manifestPath: /* 清单文件路径 */ string;
  marketplace: /* 所属市场标识 */ string;
  rootPath: string;
  source: /* 插件来源 */ PluginSource;
}
export interface /* 插件组件集合 */ PluginComponents {
  commandRoots: CustomCommandRoot[];
  hooks: Partial<Record<HookEventName, HookMatcherConfig[]>>;
  hookDetails: /* 钩子明细 */ PluginHookDetail[];
  mcpServers: Record<string, McpServerConfig>;
  skillCount: /* 技能数量 */ number;
  skillRoots: SkillRoot[];
}
export interface /* 中止选项 */ PluginAbortOptions {
  signal?: AbortSignal;
}
