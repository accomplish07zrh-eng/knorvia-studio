// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

function configuredValues(value: unknown): PluginOptionValues {
  return isRecord(value)
    ? (Object.fromEntries(
        Object.entries(value).filter(([, item]) => isPluginOptionValue(item)),
      ) as PluginOptionValues)
    : {};
}

export function projectPlugin(
  /* 发现请求 */ request: PluginDiscoverRequest,
  /* 已装载插件 */ loaded: LoadedPlugin,
  enabled: boolean,
  /* 展示优先级（数值越小越靠前） */ priority: number,
  /* 逐条诊断收集器 */ diagnostics: PluginDiagnostic[],
): { metadata: PluginMetadata; runtime: PluginComponents } {
  const dataPath = join(request.storageRoot, "data", sanitizePluginId(loaded.id));
  if (enabled) mkdirSync(dataPath, { recursive: true });
  const options = configuredValues(request.config.options[loaded.id]);
  const skillPaths = componentPaths(loaded, "skills", diagnostics);
  const skills = skillFiles(loaded, skillPaths, diagnostics);
  const commandPaths = componentPaths(loaded, "commands", diagnostics);
  const generated = materializeCommands(loaded, dataPath, enabled, diagnostics);
  if (generated && !commandPaths.includes(generated)) commandPaths.push(generated);
  for (const component of ["channels", "lspServers", "outputStyles", "settings"] as const) {
    if (loaded.manifest[component] !== undefined)
      diagnostic(
        diagnostics,
        "plugin_unsupported_component",
        `Plugin component ${component} is not supported`,
        loaded,
        loaded.manifestPath,
      );
  }
  const scope = loaded.source === "official" ? "system" : "user";
  const hooks = resolveHooks(loaded, dataPath, diagnostics);
  const definitions = loadPluginMcpServerDefinitions({ loaded, diagnostics });
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
  const context = {
    id: /* 插件标识 */ loaded.id,
    /* 清单名 */ name: loaded.manifest.name,
    /* 插件根目录 */ rootPath: loaded.rootPath,
    /* 插件数据目录 */ dataPath,
  };
  const runtime: PluginComponents = {
    commandRoots: enabled
      ? commandPaths.map((path) => ({
          path,
          plugin: context,
          scope,
          source: "plugin",
          priority: priority + 1,
        }))
      : [],
    skillRoots: enabled
      ? skillPaths.map((path) => ({ path, pluginId: loaded.id, scope, source: "plugin", priority }))
      : [],
    hooks: enabled ? hooks.hooks : {},
    /* 分 hook 类型的明细 */ hookDetails: hooks.details,
    mcpServers: servers,
    skillCount: skills.length,
  };
  const author = normalizeAuthorValue(loaded.manifest.author);
  const metadata: PluginMetadata = {
    /* 插件标识 */ id: loaded.id,
    /* 清单名 */ name: loaded.manifest.name,
    /* 清单路径 */ manifestPath: loaded.manifestPath,
    /* 所属市场 */ marketplace: loaded.marketplace,
    /* 插件根目录 */ rootPath: loaded.rootPath,
    /* 来源类别 */ source: loaded.source,
    dataPath,
    enabled,
    commandRootCount: commandPaths.length,
    skillRootCount: skillPaths.length,
    skillCount: skills.length,
    hookDetails: hooks.details,
    mcpServerNames: Object.keys(servers),
    /* 声明过的 MCP 服务名（即使未解析成功也保留） */ declaredMcpServerNames:
      Object.keys(definitions),
    components: enumeratePluginComponents(loaded.rootPath, loaded.manifest, {
      loaded,
      diagnostics,
    }),
    ...(loaded.manifest.version === undefined ? {} : { version: loaded.manifest.version }),
    ...(loaded.manifest.description === undefined
      ? {}
      : { description: loaded.manifest.description }),
    ...(loaded.manifest.homepage === undefined ? {} : { homepage: loaded.manifest.homepage }),
    ...(author?.name === undefined ? {} : { author: author.name }),
    ...(author?.url === undefined ? {} : { authorUrl: author.url }),
    ...(loaded.manifest.userConfig === undefined ? {} : { userConfig: loaded.manifest.userConfig }),
    ...(Object.keys(options).length ? { configuredOptions: options } : {}),
  };
  return { metadata, runtime };
}
