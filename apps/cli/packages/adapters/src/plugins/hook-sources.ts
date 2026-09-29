// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { HookEventName, type PluginDiagnostic } from "@knorvia/contracts";
import { isRecord, isNotFoundError, resolveInside } from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import type { LoadedPlugin } from "./types.js";

interface PluginHookSource {
  rawHooks: unknown;
  sourcePath: string;
  wrapper: boolean;
}
interface SourceInput {
  diagnostics: PluginDiagnostic[];
  loaded: LoadedPlugin;
}

export function listPluginHookSources({ diagnostics, loaded }: SourceInput): PluginHookSource[] {
  const result: PluginHookSource[] = [];
  const seen = new Set<string>();
  const add = (rawHooks: unknown, sourcePath: string): void => {
    if (!isRecord(rawHooks)) {
      diagnostic(
        diagnostics,
        "plugin_hook_invalid",
        "Hook declarations must be objects",
        loaded,
        sourcePath,
      );
      return;
    }
    result.push({ rawHooks, sourcePath, wrapper: Object.hasOwn(rawHooks, "hooks") });
  };
  const file = (path: string, optional: boolean): void => {
    try {
      const canonical = realpathSync(path);
      if (seen.has(canonical)) return;
      seen.add(canonical);
      const value: unknown = JSON.parse(readFileSync(path, "utf8"));
      add(value, path);
    } catch (error) {
      if (!optional || !isNotFoundError(error))
        diagnostic(
          diagnostics,
          "plugin_hook_read_failed",
          "Cannot read hook declaration",
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
      if (path) file(path, false);
      else
        diagnostic(
          diagnostics,
          "plugin_component_path_invalid",
          "Hook source escapes plugin root",
          loaded,
          loaded.manifestPath,
        );
    } else if (value !== undefined) add(value, loaded.manifestPath);
  };
  file(join(loaded.rootPath, "hooks", "hooks.json"), true);
  visit(loaded.manifest.hooks);
  return result;
}

export function listPluginHookEventNames(input: SourceInput): HookEventName[] {
  const valid = new Set<string>(Object.values(HookEventName));
  const names = new Set<HookEventName>();
  for (const source of listPluginHookSources(input)) {
    const raw =
      source.wrapper && isRecord(source.rawHooks) ? source.rawHooks.hooks : source.rawHooks;
    if (!isRecord(raw)) continue;
    for (const name of Object.keys(raw)) {
      if (valid.has(name)) names.add(name as HookEventName);
      else
        diagnostic(
          input.diagnostics,
          "plugin_hook_unsupported_event",
          `Unsupported hook event ${name}`,
          input.loaded,
          source.sourcePath,
        );
    }
  }
  return [...names];
}
