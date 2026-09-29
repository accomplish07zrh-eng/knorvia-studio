// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  HookEventName,
  HookMatcherConfigSchema,
  type HookConfig,
  type HookMatcherConfig,
  type PluginDiagnostic,
  type PluginHookDetail,
} from "@knorvia/contracts";
import { isRecord } from "./helpers.js";
import { listPluginHookSources } from "./hook-sources.js";
import { diagnostic } from "./discovery-diagnostics.js";
import type { LoadedPlugin } from "./types.js";

type ParsedHook = NonNullable<
  ReturnType<typeof HookMatcherConfigSchema.safeParse>["data"]
>["hooks"][number];

function ownedHook(
  value: ParsedHook,
  loaded: LoadedPlugin,
  dataPath: string,
  sourcePath: string,
): HookConfig {
  const common = {
    command: value.command,
    plugin: {
      id: loaded.id,
      name: loaded.manifest.name,
      rootPath: loaded.rootPath,
      dataPath,
      sourcePath,
    },
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
    ...(value.statusMessage === undefined ? {} : { statusMessage: value.statusMessage }),
  };
  if (value.type === "process")
    return { ...common, type: "process", ...(value.args ? { args: [...value.args] } : {}) };
  return {
    ...common,
    type: "command",
    ...(value.async === undefined ? {} : { async: value.async }),
    ...(value.timeout === undefined ? {} : { timeout: value.timeout }),
    ...(value.shell === undefined ? {} : { shell: value.shell }),
  };
}

export function resolveHooks(
  loaded: LoadedPlugin,
  dataPath: string,
  diagnostics: PluginDiagnostic[],
): {
  hooks: Partial<Record<HookEventName, HookMatcherConfig[]>>;
  details: PluginHookDetail[];
} {
  const hooks: Partial<Record<HookEventName, HookMatcherConfig[]>> = {};
  const details: PluginHookDetail[] = [];
  const events = new Set<string>(Object.values(HookEventName));
  for (const source of listPluginHookSources({ loaded, diagnostics })) {
    const raw =
      source.wrapper && isRecord(source.rawHooks) ? source.rawHooks.hooks : source.rawHooks;
    if (!isRecord(raw)) {
      diagnostic(
        diagnostics,
        "plugin_hook_invalid",
        "Hook map is invalid",
        loaded,
        source.sourcePath,
      );
      continue;
    }
    for (const [name, matchers] of Object.entries(raw)) {
      if (!events.has(name)) {
        diagnostic(
          diagnostics,
          "plugin_hook_unsupported_event",
          `Unsupported hook event ${name}`,
          loaded,
          source.sourcePath,
        );
        continue;
      }
      if (!Array.isArray(matchers)) {
        diagnostic(
          diagnostics,
          "plugin_hook_invalid",
          `Invalid matchers for ${name}`,
          loaded,
          source.sourcePath,
        );
        continue;
      }
      const event = name as HookEventName;
      for (const matcher of matchers) {
        const parsed = HookMatcherConfigSchema.safeParse(matcher);
        if (!parsed.success) {
          diagnostic(
            diagnostics,
            "plugin_hook_invalid",
            `Invalid matcher for ${name}`,
            loaded,
            source.sourcePath,
          );
          continue;
        }
        const owned = parsed.data.hooks.map((hook) =>
          ownedHook(hook, loaded, dataPath, source.sourcePath),
        );
        const projected: HookMatcherConfig = {
          hooks: owned,
          ...(parsed.data.matcher === undefined ? {} : { matcher: parsed.data.matcher }),
        };
        (hooks[event] ??= []).push(projected);
        for (const hook of owned) {
          const detail: PluginHookDetail = {
            event,
            type: hook.type,
            command: hook.command,
            runnable: hook.enabled !== false,
            sourcePath: source.sourcePath,
            ...(projected.matcher === undefined ? {} : { matcher: projected.matcher }),
            ...(hook.statusMessage === undefined ? {} : { statusMessage: hook.statusMessage }),
            ...(hook.timeoutMs === undefined ? {} : { timeoutMs: hook.timeoutMs }),
          };
          if (hook.type === "process" && hook.args) detail.args = [...hook.args];
          if (hook.type === "command") {
            if (hook.async !== undefined) detail.async = hook.async;
            if (hook.timeout !== undefined) detail.timeout = hook.timeout;
            if (hook.shell !== undefined) detail.shell = hook.shell;
          }
          details.push(detail);
        }
      }
    }
  }
  return { hooks, details };
}
