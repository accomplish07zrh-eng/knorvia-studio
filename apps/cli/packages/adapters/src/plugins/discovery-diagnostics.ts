// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PluginDiagnostic, PluginDiagnosticCode } from "@knorvia/contracts";
import type { LoadedPlugin } from "./types.js";

export function diagnostic(
  target: PluginDiagnostic[],
  code: PluginDiagnosticCode,
  message: string,
  loaded?: LoadedPlugin,
  path?: string,
  severity: PluginDiagnostic["severity"] = "warning",
): void {
  target.push({
    code,
    message,
    severity,
    ...(loaded ? { pluginId: loaded.id } : {}),
    ...(path ? { path } : {}),
  });
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function validIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value);
}
