// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件的 MCP 服务声明：从哪里读、怎么合并、以及最终投影成可连接的配置。
// 声明有三个来源（插件根下的 .mcp.json、清单里的 mcpServers、组件引用指向的文件），
// 后读到的覆盖先读到的。任何一条声明不合法都只留诊断，不中断其它服务的解析。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig, PluginDiagnostic, PluginOptionValues } from "@knorvia/contracts";
import { isNotFoundError, isRecord, resolveInside } from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import { projectMcpTransport } from "./mcp-transport.js";
import { PluginVariableError } from "./mcp-templates.js";
import type { LoadedPlugin } from "./types.js";

/** 插件根下的 MCP 声明文件；缺失是正常情况。 */
const DECLARATION_FILE = ".mcp.json";

/** 声明对象里可能包一层 mcpServers 键，两种形态都要接。 */
const SERVERS_KEY = "mcpServers";

/** 读一份声明的诊断目录：把「错误码 + 文案」集中在这里。 */
const PROBLEM = {
  notServerMap: ["plugin_mcp_invalid", "MCP declaration must be a server map"],
  unreadable: ["plugin_mcp_read_failed", "Cannot read MCP declaration"],
  pathEscapes: ["plugin_component_path_invalid", "MCP path escapes plugin root"],
  variableMissing: ["plugin_variable_missing", ""],
  serverDisabled: ["plugin_mcp_server_disabled", ""],
} as const;

/** 声明读取的入口参数。 */
type DeclarationAsk = {
  diagnostics: PluginDiagnostic[];
  loaded: LoadedPlugin;
};

/** 服务的投影参数：连接需要的数据根、环境、选项与工作目录都在这里。 */
type ProjectionAsk = {
  dataPath: string;
  definitions?: Record<string, unknown>;
  diagnostics: PluginDiagnostic[];
  env: Record<string, string | undefined>;
  loaded: LoadedPlugin;
  options: PluginOptionValues;
  workingDirectory: string;
};

/** 记一条与插件清单绑定的诊断（路径取清单文件）。 */
function reportAtManifest(
  ask: DeclarationAsk,
  problem: readonly [string, string],
  message?: string,
): void {
  diagnostic(
    ask.diagnostics,
    problem[0] as never,
    message ?? problem[1],
    ask.loaded,
    ask.loaded.manifestPath,
  );
}

/** 记一条指定路径的诊断。 */
function reportAtPath(ask: DeclarationAsk, problem: readonly [string, string], path: string): void {
  diagnostic(ask.diagnostics, problem[0] as never, problem[1], ask.loaded, path);
}

/** 把一份声明并进累积表；不是服务映射就留诊断并跳过。 */
function mergeServers(
  target: Map<string, unknown>,
  value: unknown,
  path: string,
  ask: DeclarationAsk,
): void {
  const servers = isRecord(value) && Object.hasOwn(value, SERVERS_KEY) ? value[SERVERS_KEY] : value;
  if (!isRecord(servers)) {
    reportAtPath(ask, PROBLEM.notServerMap, path);
    return;
  }
  for (const [name, server] of Object.entries(servers)) target.set(name, server);
}

/** 读一个声明文件并并入；optional 为真时「文件不存在」不算错误。 */
function readDeclarationFile(
  target: Map<string, unknown>,
  path: string,
  optional: boolean,
  ask: DeclarationAsk,
): void {
  try {
    mergeServers(target, JSON.parse(readFileSync(path, "utf8")) as unknown, path, ask);
  } catch (failure) {
    if (optional && isNotFoundError(failure)) return;
    reportAtPath(ask, PROBLEM.unreadable, path);
  }
}

/** 处理组件引用：字符串按插件根解析，数组逐项下钻，其它形态直接当声明合并。 */
function visitReference(target: Map<string, unknown>, value: unknown, ask: DeclarationAsk): void {
  if (Array.isArray(value)) {
    for (const item of value) visitReference(target, item, ask);
    return;
  }
  if (typeof value === "string") {
    const resolved = resolveInside(ask.loaded.rootPath, value);
    if (resolved === null) reportAtManifest(ask, PROBLEM.pathEscapes);
    else readDeclarationFile(target, resolved, false, ask);
    return;
  }
  if (value !== undefined) mergeServers(target, value, ask.loaded.manifestPath, ask);
}

export function /* 读取插件的 MCP 服务声明（清单 / .mcp.json / 组件引用） */ loadPluginMcpServerDefinitions(
  ask: DeclarationAsk,
): /* 服务名 → 原始配置 */ Record<string, unknown> {
  const collected = new Map<string, unknown>();
  // 先读插件根下的独立声明（可缺），再看清单声明与组件引用（后者覆盖前者）。
  readDeclarationFile(collected, join(ask.loaded.rootPath, DECLARATION_FILE), true, ask);
  visitReference(collected, ask.loaded.manifest.mcpServers, ask);
  return Object.fromEntries(collected);
}

/** 投影失败时的两条诊断：变量缺失（若确属该类）与「服务已禁用」。 */
function reportProjectionFailure(failure: unknown, key: string, ask: ProjectionAsk): void {
  if (failure instanceof PluginVariableError) {
    diagnostic(
      ask.diagnostics,
      PROBLEM.variableMissing[0] as never,
      failure.message,
      ask.loaded,
      ask.loaded.manifestPath,
    );
  }
  diagnostic(
    ask.diagnostics,
    PROBLEM.serverDisabled[0] as never,
    `MCP server ${key} is disabled because its configuration is invalid`,
    ask.loaded,
    ask.loaded.manifestPath,
  );
}

export function /* 把声明投影为可连接的 MCP 服务配置 */ resolvePluginMcpServers(
  ask: ProjectionAsk,
): /* 服务名 → 连接配置 */ Record<string, McpServerConfig> {
  const definitions = ask.definitions ?? loadPluginMcpServerDefinitions(ask);
  const projected: [string, McpServerConfig][] = [];
  for (const [key, declaration] of Object.entries(definitions)) {
    const qualified = `plugin:${ask.loaded.manifest.name}:${key}`;
    try {
      const config = projectMcpTransport(declaration, key, ask);
      projected.push([qualified, config]);
    } catch (failure) {
      reportProjectionFailure(failure, key, ask);
    }
  }
  return Object.fromEntries(projected);
}
