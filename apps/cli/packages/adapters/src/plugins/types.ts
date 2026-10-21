// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件领域的内存视图类型。
//
// 分三层看：
//   - **候选**（PluginCandidate）：扫描阶段发现的「可能是插件」的目录，此时只有来源与启用位；
//   - **已加载**（LoadedPlugin）：清单解析通过后，带 id 与清单路径；
//   - **组件**（PluginComponents）：从清单里物化出的可执行部件（命令、钩子、MCP、技能）。
//
// PluginAbortOptions 是各阶段共用的取消通道。

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

/** 插件从哪来、放在哪、默认开不开。 */
type PluginOrigin = {
  marketplace: string;
  rootPath: string;
  source: PluginSource;
};

/** 扫描阶段的候选插件：只有来源与启用位，还没有解析出清单。 */
type PluginCandidate = PluginOrigin & { defaultEnabled: boolean };

/** 插件身份：清单解析后才有。 */
type PluginIdentity = {
  id: string;
  manifest: PluginManifest;
  manifestPath: string;
};

/** 已加载插件：身份 + 来源。 */
type LoadedPlugin = PluginIdentity & PluginOrigin;

/** 清单里的命令与技能根目录。 */
type PluginRoots = {
  commandRoots: CustomCommandRoot[];
  skillRoots: SkillRoot[];
};

/** 清单里的钩子：按事件名分组的匹配配置，外加一份供 UI 展示的明细。 */
type PluginHooks = {
  hooks: Partial<Record<HookEventName, HookMatcherConfig[]>>;
  hookDetails: PluginHookDetail[];
};

/** 清单里的 MCP 服务：服务名 → 配置。 */
type PluginMcp = { mcpServers: Record<string, McpServerConfig> };

/** 技能数量（物化时统计，避免调用方反复算）。 */
type PluginSkillTally = { skillCount: number };

/** 从清单物化出的可执行部件。 */
type PluginComponents = PluginRoots & PluginHooks & PluginMcp & PluginSkillTally;

/** 各阶段共用的取消通道。 */
type PluginAbortOptions = { signal?: AbortSignal };

export type {
  PluginOrigin,
  PluginCandidate,
  PluginIdentity,
  LoadedPlugin,
  PluginRoots,
  PluginHooks,
  PluginMcp,
  PluginSkillTally,
  PluginComponents,
  PluginAbortOptions,
};
