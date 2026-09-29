// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PluginOptionValues } from "@knorvia/contracts";
import { isPluginOptionValue, isRecord } from "./helpers.js";
import type { LoadedPlugin } from "./types.js";

export interface TemplateContext {
  dataPath: string;
  env: Record<string, string | undefined>;
  loaded: LoadedPlugin;
  options: PluginOptionValues;
  workingDirectory: string;
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

function substitution(
  name: string,
  context: TemplateContext,
  sensitiveAllowed: boolean,
): string | undefined {
  const paths: Record<string, string> = {
    KNORVIA_PLUGIN_ROOT: context.loaded.rootPath,
    CLAUDE_PLUGIN_ROOT: context.loaded.rootPath,
    KNORVIA_PLUGIN_DATA: context.dataPath,
    CLAUDE_PLUGIN_DATA: context.dataPath,
    KNORVIA_PROJECT_DIR: context.workingDirectory,
    CLAUDE_PROJECT_DIR: context.workingDirectory,
  };
  if (Object.hasOwn(paths, name)) return paths[name];
  if (name.startsWith("user_config.")) {
    const key = name.slice("user_config.".length);
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
  value: string,
  context: TemplateContext,
  sensitiveAllowed: boolean,
): string {
  return value.replace(
    /\$\{([^}]+)\}/g,
    (original: string, name: string) => substitution(name, context, sensitiveAllowed) ?? original,
  );
}

export function expandStringMap(
  value: unknown,
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
