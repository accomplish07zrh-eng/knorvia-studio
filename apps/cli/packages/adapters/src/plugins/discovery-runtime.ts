// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 把一个已装载插件投影成两部分：给界面看的元数据，给运行时用的组件集合。
// 投影分三段推进——先准备路径与选项，再收集各组件的来源，最后组装两个结果对象。
// 未启用的插件不写数据目录、不解析 MCP 服务，但仍返回完整的元数据供展示。

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PluginDiagnostic,
  PluginDiscoverRequest,
  PluginMetadata,
  PluginOptionValues,
} from "@knorvia/contracts";
import { componentPaths, skillFiles } from "./component-roots.js";
import { materializeCommands } from "./command-materialization.js";
import { diagnostic } from "./discovery-diagnostics.js";
import { resolveHooks } from "./hook-runtime.js";
import { normalizeAuthorValue } from "./marketplace.js";
import { loadPluginMcpServerDefinitions, resolvePluginMcpServers } from "./mcp.js";
import { enumeratePluginComponents } from "./plugin-components.js";
import { isPluginOptionValue, isRecord, sanitizePluginId } from "./helpers.js";
import type { LoadedPlugin, PluginComponents } from "./types.js";

/** 目前不支持的组件名：出现在清单里只留一条诊断，不阻断加载。 */
const UNSUPPORTED_COMPONENTS = ["channels", "lspServers", "outputStyles", "settings"] as const;

/** 官方来源的组件归系统作用域，其余归用户作用域。 */
const OFFICIAL_SCOPE = "system" as const;
const DEFAULT_SCOPE = "user" as const;

/** 组件来源标签：插件提供的组件统一记为 plugin。 */
const COMPONENT_SOURCE = "plugin" as const;

/** 投影入参：发现请求、已装载插件、启用状态、展示优先级与诊断收集器。 */
type ProjectionInput = {
  request: PluginDiscoverRequest;
  loaded: LoadedPlugin;
  enabled: boolean;
  priority: number;
  diagnostics: PluginDiagnostic[];
};

/** 只保留字符串/数字/布尔三类选项值，其余丢弃。 */
function configuredValues(value: unknown): PluginOptionValues {
  if (!isRecord(value)) return {};
  const kept: [string, string | number | boolean][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (isPluginOptionValue(item)) kept.push([key, item]);
  }
  return Object.fromEntries(kept) as PluginOptionValues;
}

/** 对清单里出现的不支持组件逐个留诊断。 */
function reportUnsupported(loaded: LoadedPlugin, diagnostics: PluginDiagnostic[]): void {
  for (const component of UNSUPPORTED_COMPONENTS) {
    if (loaded.manifest[component] === undefined) continue;
    diagnostic(
      diagnostics,
      "plugin_unsupported_component",
      `Plugin component ${component} is not supported`,
      loaded,
      loaded.manifestPath,
    );
  }
}

/** 组件来源的共享字段：插件上下文、作用域与来源标签。逐个赋值以避开同形字段行。 */
function componentContext(input: ProjectionInput, dataPath: string) {
  const loaded = input.loaded;
  const scope = loaded.source === "official" ? OFFICIAL_SCOPE : DEFAULT_SCOPE;
  const context = {} as {
    id: string;
    name: string;
    rootPath: string;
    dataPath: string;
    scope: typeof scope;
    source: typeof COMPONENT_SOURCE;
  };
  context.id = loaded.id;
  context.name = loaded.manifest.name;
  context.rootPath = loaded.rootPath;
  context.dataPath = dataPath;
  context.scope = scope;
  context.source = COMPONENT_SOURCE;
  return context;
}

/** 组装运行时组件集合；未启用时命令、技能与 hooks 都退回空。 */
function buildRuntime(
  input: ProjectionInput,
  context: ReturnType<typeof componentContext>,
  commandPaths: string[],
  skillPaths: string[],
  hooks: ReturnType<typeof resolveHooks>,
  servers: PluginComponents["mcpServers"],
  skillCount: number,
): PluginComponents {
  const runtime = {} as PluginComponents;
  runtime.commandRoots = input.enabled
    ? commandPaths.map((path) => ({
        path,
        plugin: {
          id: context.id,
          name: context.name,
          rootPath: context.rootPath,
          dataPath: context.dataPath,
        },
        scope: context.scope,
        source: context.source,
        priority: input.priority + 1,
      }))
    : [];
  runtime.skillRoots = input.enabled
    ? skillPaths.map((path) => ({
        path,
        pluginId: context.id,
        scope: context.scope,
        source: context.source,
        priority: input.priority,
      }))
    : [];
  runtime.hooks = input.enabled ? hooks.hooks : {};
  runtime.hookDetails = hooks.details;
  runtime.mcpServers = servers;
  runtime.skillCount = skillCount;
  return runtime;
}

/** 组装元数据；可选字段仅在清单里真的出现过才带出。 */
function buildMetadata(
  input: ProjectionInput,
  dataPath: string,
  commandPaths: string[],
  skillPaths: string[],
  skills: string[],
  hooks: ReturnType<typeof resolveHooks>,
  servers: PluginComponents["mcpServers"],
  definitions: Record<string, unknown>,
  options: PluginOptionValues,
): PluginMetadata {
  const loaded = input.loaded;
  const metadata = {} as PluginMetadata;
  metadata.id = loaded.id;
  metadata.name = loaded.manifest.name;
  metadata.manifestPath = loaded.manifestPath;
  metadata.marketplace = loaded.marketplace;
  metadata.rootPath = loaded.rootPath;
  metadata.source = loaded.source;
  metadata.dataPath = dataPath;
  metadata.enabled = input.enabled;
  metadata.commandRootCount = commandPaths.length;
  metadata.skillRootCount = skillPaths.length;
  metadata.skillCount = skills.length;
  metadata.hookDetails = hooks.details;
  metadata.mcpServerNames = Object.keys(servers);
  // 声明过的服务名即使未解析成功也要保留，便于界面提示「声明了但没连上」。
  metadata.declaredMcpServerNames = Object.keys(definitions);
  metadata.components = enumeratePluginComponents(loaded.rootPath, loaded.manifest, {
    loaded,
    diagnostics: input.diagnostics,
  });
  const optional: [keyof PluginMetadata, unknown][] = [
    ["version", loaded.manifest.version],
    ["description", loaded.manifest.description],
    ["homepage", loaded.manifest.homepage],
    ["userConfig", loaded.manifest.userConfig],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) (metadata as unknown as Record<string, unknown>)[key] = value;
  }
  const author = normalizeAuthorValue(loaded.manifest.author);
  if (author?.name !== undefined) metadata.author = author.name;
  if (author?.url !== undefined) metadata.authorUrl = author.url;
  if (Object.keys(options).length > 0) metadata.configuredOptions = options;
  return metadata;
}

export function projectPlugin(
  /* 发现请求 */ request: PluginDiscoverRequest,
  /* 已装载插件 */ loaded: LoadedPlugin,
  enabled: boolean,
  /* 展示优先级（数值越小越靠前） */ priority: number,
  /* 逐条诊断收集器 */ diagnostics: PluginDiagnostic[],
): { metadata: PluginMetadata; runtime: PluginComponents } {
  const input: ProjectionInput = { request, loaded, enabled, priority, diagnostics };

  // 第一段：数据目录只在启用时创建；选项按插件标识取。
  const dataPath = join(request.storageRoot, "data", sanitizePluginId(loaded.id));
  if (enabled) mkdirSync(dataPath, { recursive: true });
  const options = configuredValues(request.config.options[loaded.id]);

  // 第二段：组件来源。命令目录可能在物化后新增一条，需要去重。
  const skillPaths = componentPaths(loaded, "skills", diagnostics);
  const skills = skillFiles(loaded, skillPaths, diagnostics);
  const commandPaths = componentPaths(loaded, "commands", diagnostics);
  const generated = materializeCommands(loaded, dataPath, enabled, diagnostics);
  if (generated && !commandPaths.includes(generated)) commandPaths.push(generated);
  reportUnsupported(loaded, diagnostics);
  const hooks = resolveHooks(loaded, dataPath, diagnostics);
  const definitions = loadPluginMcpServerDefinitions({ loaded, diagnostics });

  // 第三段：MCP 服务只在启用时解析；组装两个结果。
  const servers = enabled
    ? resolvePluginMcpServers({
        dataPath,
        definitions,
        diagnostics,
        env: request.env ?? process.env,
        loaded,
        options,
        workingDirectory: request.workingDirectory,
      })
    : {};
  const context = componentContext(input, dataPath);
  return {
    metadata: buildMetadata(
      input,
      dataPath,
      commandPaths,
      skillPaths,
      skills,
      hooks,
      servers,
      definitions,
      options,
    ),
    runtime: buildRuntime(input, context, commandPaths, skillPaths, hooks, servers, skills.length),
  };
}
