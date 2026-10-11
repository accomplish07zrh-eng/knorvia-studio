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
import type { LoadedConfig } from "./file-config.adapter.js";
import type { ProjectConfigDiscovery, ProjectConfigFile } from "./project-config-types.js";

export type McpServerConfigSource = "system" | "project" | "user" | "env" | "cli";
export type PluginConfigScope = "user" | "workspace";

export interface PluginConfigSources {
  dirs: { user: string[]; workspace: string[] };
  enabled: Record<string, PluginConfigScope>;
  marketplaces: Record<string, PluginConfigScope>;
  options: Record<string, Record<string, PluginConfigScope>>;
  paths: { user: string; workspace: string | undefined };
}

/** 项目来源只有两处入口：显式工作目录（按发现规则）或单个显式配置文件。 */
interface ProjectReadOptions {
  projectConfigPath?: string;
  workingDirectory?: string;
}

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
  const file = loadProjectConfigFile(projectConfigPath, {
    discoveryOrder: 0,
    explicitProjectConfig: true,
  });
  return summarizeProjectConfigs([file]);
}

/** 多份项目文件按 Project 作用域合并；空列表给出「未加载」的空结果。 */
export function summarizeProjectFiles(files: ProjectConfigFile[]): {
  config: RuntimeConfigPatch;
  diagnostics: LoadedConfig["diagnostics"];
  path: string | undefined;
  loaded: boolean;
} {
  const last = files.at(-1);
  if (last === undefined) return { config: {}, diagnostics: [], loaded: false, path: undefined };
  const layers = files.map((file) => createPrioritizedConfig(file.config, ConfigScope.Project));
  const diagnostics = files.flatMap((file) => file.diagnostics);
  return { config: mergeConfigs(...layers), diagnostics, loaded: true, path: last.path };
}

/** 按「用户 → 工作区」顺序登记同名键的归属：后者覆盖前者。 */
function attributeByScope<T>(
  sources: ReadonlyArray<readonly [PluginConfigScope, Record<string, T> | undefined]>,
  pick: (config: Record<string, T>) => void,
): void {
  for (const [, table] of sources) {
    if (table !== undefined) pick(table);
  }
}

function keysOf(table: Record<string, unknown> | undefined): string[] {
  return table === undefined ? [] : Object.keys(table);
}

export function describePluginSources(
  user: RuntimeConfigPatch,
  project: RuntimeConfigPatch,
  userPath: string,
  projectPath: string | undefined,
): PluginConfigSources {
  const layers: Array<readonly [PluginConfigScope, RuntimeConfigPatch]> = [
    ["user", user],
    ["workspace", project],
  ];
  const enabled: PluginConfigSources["enabled"] = {};
  for (const [scope, config] of layers) {
    for (const name of keysOf(config.plugins?.enabledPlugins)) enabled[name] = scope;
  }
  const marketplaces: PluginConfigSources["marketplaces"] = {};
  for (const name of keysOf(user.plugins?.extraKnownMarketplaces)) marketplaces[name] = "user";
  const options: PluginConfigSources["options"] = {};
  attributeByScope(
    layers.map(([scope, config]) => [scope, config.plugins?.options] as const),
    (table) => {
      for (const plugin of Object.keys(table)) {
        options[plugin] ??= {};
      }
    },
  );
  for (const [scope, config] of layers) {
    for (const [plugin, settings] of Object.entries(config.plugins?.options ?? {})) {
      for (const name of Object.keys(settings)) options[plugin]![name] = scope;
    }
  }
  return {
    dirs: { user: user.plugins?.dirs ?? [], workspace: project.plugins?.dirs ?? [] },
    enabled,
    marketplaces,
    options,
    paths: { user: userPath, workspace: projectPath },
  };
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
