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

export function loadPluginMcpServerDefinitions(input: {
  diagnostics: PluginDiagnostic[];
  loaded: LoadedPlugin;
}): Record<string, unknown> {
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
    } catch (error) {
      if (!optional || !isNotFoundError(error))
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

export function resolvePluginMcpServers(input: {
  dataPath: string;
  definitions?: Record<string, unknown>;
  diagnostics: PluginDiagnostic[];
  env: Record<string, string | undefined>;
  loaded: LoadedPlugin;
  options: PluginOptionValues;
  workingDirectory: string;
}): Record<string, McpServerConfig> {
  const definitions = input.definitions ?? loadPluginMcpServerDefinitions(input);
  const output: Array<[string, McpServerConfig]> = [];
  for (const [key, value] of Object.entries(definitions)) {
    try {
      output.push([
        `plugin:${input.loaded.manifest.name}:${key}`,
        projectMcpTransport(value, key, input),
      ]);
    } catch (error) {
      if (error instanceof PluginVariableError)
        diagnostic(
          input.diagnostics,
          "plugin_variable_missing",
          error.message,
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
