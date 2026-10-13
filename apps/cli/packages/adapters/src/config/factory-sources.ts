// SPDX-License-Identifier: Apache-2.0
// 配置来源归因：hook 来源标记、项目发现汇总、插件/MCP 归属表。
import {
  ConfigScope,
  DefaultRuntimeConfig,
  type HookConfigSource,
  type McpServerConfig,
  type RuntimeConfigPatch,
} from "@knorvia/contracts";
import {
  loadProjectConfigFile,
  loadProjectConfigs,
  summarizeProjectConfigs,
} from "./project-config.adapter.js";
import { createPrioritizedConfig, mergeConfigs } from "./config-merger.js";
import type {
  McpServerConfigSource,
  PluginConfigScope,
  PluginConfigSources,
} from "./factory-types.js";
import type { ProjectConfigDiscovery, ProjectConfigFile } from "./project-config-types.js";

export type {
  McpServerConfigSource,
  PluginConfigScope,
  PluginConfigSources,
} from "./factory-types.js";

/** 项目来源只有两处入口：显式工作目录（按发现规则）或单个显式配置文件。 */
interface ProjectReadOptions {
  projectConfigPath?: string;
  workingDirectory?: string;
}

type ProjectSummary = Pick<ProjectConfigDiscovery, "diagnostics" | "loaded"> & {
  config: RuntimeConfigPatch;
  path: string | undefined;
};

/** 给每个 hook 补上来源标记：已有 source 的保持原样，缺的按传入来源补齐。 */
export function tagHookSources(
  patch: RuntimeConfigPatch,
  source: HookConfigSource,
): RuntimeConfigPatch {
  const events = patch.hooks?.events;
  if (events === undefined) return patch;
  const tagged: typeof events = {};
  for (const [event, matchers] of Object.entries(events)) {
    if (matchers === undefined) continue;
    tagged[event as keyof typeof events] = matchers.map((matcher) => {
      const hooks = matcher.hooks.map((hook) => ({ ...hook, source: hook.source ?? source }));
      return { ...matcher, hooks };
    });
  }
  return { ...patch, hooks: { ...patch.hooks, events: tagged } };
}

export function readProjectDiscovery(options: ProjectReadOptions): ProjectConfigDiscovery {
  const { workingDirectory, projectConfigPath } = options;
  if (workingDirectory) return loadProjectConfigs(workingDirectory, projectConfigPath);
  if (!projectConfigPath) return summarizeProjectConfigs([]);
  const explicit = {} as NonNullable<Parameters<typeof loadProjectConfigFile>[1]>;
  explicit.discoveryOrder = 0;
  explicit.explicitProjectConfig = true;
  return summarizeProjectConfigs([loadProjectConfigFile(projectConfigPath, explicit)]);
}

/** 多份项目文件按 Project 作用域合并；空列表给出「未加载」的空结果。 */
export function summarizeProjectFiles(files: ProjectConfigFile[]): ProjectSummary {
  const last = files.at(-1);
  if (last === undefined) {
    const empty = {} as ProjectSummary;
    empty.config = {};
    empty.diagnostics = [];
    empty.loaded = false;
    empty.path = undefined;
    return empty;
  }
  const summary = {} as ProjectSummary;
  summary.config = mergeConfigs(
    ...files.map((file) => createPrioritizedConfig(file.config, ConfigScope.Project)),
  );
  summary.diagnostics = files.flatMap((file) => file.diagnostics);
  summary.loaded = true;
  summary.path = last.path;
  return summary;
}

interface PluginAttributionInput {
  projectConfig: RuntimeConfigPatch;
  projectConfigPath: string | undefined;
  userConfig: RuntimeConfigPatch;
  userConfigPath: string;
}

/** 归属登记：同一插件键在多份配置里出现时，以「工作区」为最终归属。 */
export function describePluginSources(input: PluginAttributionInput): PluginConfigSources {
  const userLayer: readonly [PluginConfigScope, RuntimeConfigPatch] = ["user", input.userConfig];
  const workspaceLayer: readonly [PluginConfigScope, RuntimeConfigPatch] = [
    "workspace",
    input.projectConfig,
  ];
  const layers = [userLayer, workspaceLayer];

  const enabled = {} as PluginConfigSources["enabled"];
  for (const [scope, config] of layers) {
    for (const name of Object.keys(config.plugins?.enabledPlugins ?? {})) enabled[name] = scope;
  }

  const marketplaces = {} as PluginConfigSources["marketplaces"];
  for (const name of Object.keys(input.userConfig.plugins?.extraKnownMarketplaces ?? {})) {
    marketplaces[name] = "user";
  }

  const options = {} as PluginConfigSources["options"];
  for (const [scope, config] of layers) {
    for (const [plugin, settings] of Object.entries(config.plugins?.options ?? {})) {
      if (options[plugin] === undefined) options[plugin] = {};
      for (const optionName of Object.keys(settings)) options[plugin]![optionName] = scope;
    }
  }

  const sources = {} as PluginConfigSources;
  sources.dirs = {
    user: input.userConfig.plugins?.dirs ?? [],
    workspace: input.projectConfig.plugins?.dirs ?? [],
  };
  sources.enabled = enabled;
  sources.marketplaces = marketplaces;
  sources.options = options;
  sources.paths = { user: input.userConfigPath, workspace: input.projectConfigPath };
  return sources;
}

interface EffectiveMcpInput {
  cli: RuntimeConfigPatch | undefined;
  env: RuntimeConfigPatch;
  project: RuntimeConfigPatch;
  user: RuntimeConfigPatch;
}

/** MCP 生效表：system → project → user → env → cli 依次覆盖同名 server。 */
export function selectEffectiveMcp(input: EffectiveMcpInput): {
  servers: Record<string, McpServerConfig>;
  serverSources: Record<string, McpServerConfigSource>;
} {
  const layers: Array<readonly [McpServerConfigSource, RuntimeConfigPatch | undefined]> = [
    ["system", DefaultRuntimeConfig],
    ["project", input.project],
    ["user", input.user],
    ["env", input.env],
    ["cli", input.cli],
  ];
  const servers: Record<string, McpServerConfig> = {};
  const serverSources: Record<string, McpServerConfigSource> = {};
  for (const [source, patch] of layers) {
    for (const [name, server] of Object.entries(patch?.mcp?.servers ?? {})) {
      servers[name] = server;
      serverSources[name] = source;
    }
  }
  return { serverSources, servers };
}
