// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PluginOptionValues } from "@knorvia/contracts";
import { isPluginOptionValue, isRecord } from "./helpers.js";
import type { LoadedPlugin } from "./types.js";

export interface TemplateContext {
  /* 插件数据目录 */ dataPath: string;
  /* 进程环境变量表 */ env: Record<string, string | undefined>;
  /* 已装载插件 */ loaded: LoadedPlugin;
  /* 插件选项值 */ options: PluginOptionValues;
  /* 展开时的工作目录 */ workingDirectory: string;
}

export class PluginVariableError extends Error {
  constructor(
    readonly variable: string,
    readonly sensitive: boolean,
  ) {
    super(
      sensitive
        ? `Sensitive plugin option cannot be used here: ${variable}`
        : `Plugin variable is unavailable: ${variable}`,
    );
    this.name = "PluginVariableError";
  }
}

/** 用户配置命名空间前缀（`${user_config.<key>}` 形式引用 manifest 的 userConfig）。 */
const USER_CONFIG_PREFIX = "user_config.";

function substitution(
  name: string,
  context: TemplateContext,
  sensitiveAllowed: boolean,
): string | undefined {
  const paths: Record<string, string> = {
    KNORVIA_PLUGIN_ROOT: context.loaded.rootPath,
    CLAUDE_PLUGIN_ROOT: /* 兼容变量：与插件根一致 */ context.loaded.rootPath,
    KNORVIA_PLUGIN_DATA: context.dataPath,
    CLAUDE_PLUGIN_DATA: /* 兼容变量：与数据目录一致 */ context.dataPath,
    KNORVIA_PROJECT_DIR: context.workingDirectory,
    CLAUDE_PROJECT_DIR: /* 兼容变量：与工作目录一致 */ context.workingDirectory,
  };
  if (Object.hasOwn(paths, name)) return paths[name];
  if (name.startsWith(USER_CONFIG_PREFIX)) {
    const key = name.slice(USER_CONFIG_PREFIX.length);
    const rawDefinition = context.loaded.manifest.userConfig?.[key];
    const definition = isRecord(rawDefinition) ? rawDefinition : undefined;
    if (definition?.sensitive === true && !sensitiveAllowed)
      throw new PluginVariableError(name, true);
    const value = context.options[key] ?? definition?.default;
    if (!isPluginOptionValue(value)) throw new PluginVariableError(name, false);
    return String(value);
  }
  if (name.startsWith("KNORVIA_") || (sensitiveAllowed && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    const value = context.env[name];
    if (value === undefined) throw new PluginVariableError(name, false);
    return value;
  }
  return undefined;
}

export function expandPluginString(
  value: /* 待展开的模板串 */ string,
  context: TemplateContext,
  sensitiveAllowed: boolean,
): /* 展开结果 */ string {
  return value.replace(
    /\$\{([^}]+)\}/g,
    (original: string, name: string) => substitution(name, context, sensitiveAllowed) ?? original,
  );
}

export function expandStringMap(
  value: /* 待展开的字符串映射 */ unknown,
  context: TemplateContext,
  sensitiveAllowed: boolean,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Expected string map");
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof item !== "string") throw new Error("Expected string map value");
      return [key, expandPluginString(item, context, sensitiveAllowed)];
    }),
  );
}
