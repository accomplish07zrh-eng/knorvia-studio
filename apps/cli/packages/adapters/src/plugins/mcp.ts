// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig, PluginDiagnostic, PluginOptionValues } from "@knorvia/contracts";
import { isNotFoundError, isRecord, resolveInside } from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import { projectMcpTransport } from "./mcp-transport.js";
import { PluginVariableError } from "./mcp-templates.js";
import type { LoadedPlugin } from "./types.js";

export function /* 读取插件的 MCP 服务声明（清单 / .mcp.json / 组件引用） */ loadPluginMcpServerDefinitions(input: {
  /* 诊断收集器 */ diagnostics: PluginDiagnostic[];
  /* 已装载插件 */ loaded: LoadedPlugin;
}): /* 服务名 → 原始配置 */ Record<string, unknown> {
  const { diagnostics, loaded } = input;
  const entries = new Map<string, unknown>();
  const merge = (value: unknown, path: string): void => {
    const servers =
      isRecord(value) && Object.hasOwn(value, "mcpServers") ? value.mcpServers : value;
    if (!isRecord(servers)) {
      diagnostic(
        diagnostics,
        "plugin_mcp_invalid",
        "MCP declaration must be a server map",
        loaded,
        path,
      );
      return;
    }
    for (const [key, server] of Object.entries(servers)) entries.set(key, server);
  };
  const read = (path: string, optional: boolean): void => {
    try {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      merge(raw, path);
    } catch (failure) {
      if (!optional || !isNotFoundError(failure))
        diagnostic(
          diagnostics,
          "plugin_mcp_read_failed",
          "Cannot read MCP declaration",
          loaded,
          path,
        );
    }
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value === "string") {
      const path = resolveInside(loaded.rootPath, value);
      if (path) read(path, false);
      else
        diagnostic(
          diagnostics,
          "plugin_component_path_invalid",
          "MCP path escapes plugin root",
          loaded,
          loaded.manifestPath,
        );
    } else if (value !== undefined) merge(value, loaded.manifestPath);
  };
  read(join(loaded.rootPath, ".mcp.json"), true);
  visit(loaded.manifest.mcpServers);
  return Object.fromEntries(entries);
}

export function /* 把声明投影为可连接的 MCP 服务配置 */ resolvePluginMcpServers(input: {
  /* 插件数据目录 */ dataPath: string;
  /* 已解析的声明，缺省现场读取 */ definitions?: Record<string, unknown>;
  /* 诊断收集器 */ diagnostics: PluginDiagnostic[];
  /* 进程环境变量 */ env: Record<string, string | undefined>;
  /* 已装载插件 */ loaded: LoadedPlugin;
  /* 插件选项值 */ options: PluginOptionValues;
  /* 展开时的工作目录 */ workingDirectory: string;
}): /* 服务名 → 连接配置 */ Record<string, McpServerConfig> {
  const definitions = input.definitions ?? loadPluginMcpServerDefinitions(input);
  const output: Array<[string, McpServerConfig]> = [];
  for (const [key, value] of Object.entries(definitions)) {
    try {
      output.push([
        `plugin:${input.loaded.manifest.name}:${key}`,
        projectMcpTransport(value, key, input),
      ]);
    } catch (failure) {
      if (failure instanceof PluginVariableError)
        diagnostic(
          input.diagnostics,
          "plugin_variable_missing",
          failure.message,
          input.loaded,
          input.loaded.manifestPath,
        );
      diagnostic(
        input.diagnostics,
        "plugin_mcp_server_disabled",
        `MCP server ${key} is disabled because its configuration is invalid`,
        input.loaded,
        input.loaded.manifestPath,
      );
    }
  }
  return Object.fromEntries(output);
}
