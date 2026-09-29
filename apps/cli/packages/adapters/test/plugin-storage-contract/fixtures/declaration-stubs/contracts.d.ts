// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

declare module "@knorvia/contracts" {
  export type PluginDiagnosticCode =
    | "plugin_manifest_not_found"
    | "plugin_manifest_invalid"
    | "plugin_unsupported_component"
    | "plugin_dependency_missing"
    | "plugin_dependency_cycle"
    | "plugin_dependency_cross_marketplace"
    | "plugin_marketplace_invalid"
    | "plugin_git_unavailable"
    | "plugin_archive_fetch_failed"
    | "plugin_marketplace_source_unsupported"
    | "plugin_validation_deferred"
    | "plugin_variable_missing"
    | "plugin_not_found";

  export interface PluginDiagnostic {
    code: PluginDiagnosticCode;
    message: string;
    severity: "warning" | "error";
  }

  export interface PluginStoreListing {
    [key: string]: unknown;
  }

  export interface PluginManifest {
    name: string;
    version?: string;
    [key: string]: unknown;
  }

  export interface CustomCommandRoot {
    path: string;
  }
  export type HookEventName = string;
  export interface HookMatcherConfig {
    [key: string]: unknown;
  }
  export interface McpServerConfig {
    [key: string]: unknown;
  }
  export interface PluginHookDetail {
    [key: string]: unknown;
  }
  export type PluginSource = unknown;
  export interface SkillRoot {
    path: string;
  }
  export type PluginComponentKind = string;
  export interface PluginComponentItem {
    name: string;
  }
  export interface PluginComponentGroup {
    items: PluginComponentItem[];
    kind: PluginComponentKind;
  }
}
