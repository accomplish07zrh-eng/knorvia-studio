// Original public type owner: apps/cli/packages/contracts/src/plugins/index.ts
import type { CustomCommandRoot } from "../commands/index.js";
import type { HookEventName, HookMatcherConfig } from "../hooks/index.js";
import type { McpServerConfig } from "../interfaces/mcp.port.js";
import type { SkillRoot } from "../skills/index.js";
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
export type PluginSource = "official" | "inline" | "cache";
export interface PluginUserConfigOption {
    default?: string | number | boolean;
    description?: string;
    title?: string;
    required?: boolean;
    sensitive?: boolean;
    type?: "string" | "number" | "boolean" | "directory" | "file";
}
export type PluginOptionValue = string | number | boolean;
export type PluginOptionValues = Record<string, PluginOptionValue>;
export interface PluginHookDetail {
    args?: string[];
    async?: boolean;
    command: string;
    event: HookEventName;
    matcher?: string;
    runnable: boolean;
    shell?: true | string;
    sourcePath: string;
    statusMessage?: string;
    timeout?: number;
    timeoutMs?: number;
    type: "command" | "process";
}
export type PluginComponentKind = "agent" | "command" | "skill" | "hook" | "mcp";
export interface PluginComponentItem {
    name: string;
    description?: string;
}
export interface PluginComponentGroup {
    kind: PluginComponentKind;
    items: PluginComponentItem[];
}
export interface PluginMetadata {
    author?: string;
    authorUrl?: string;
    commandRootCount: number;
    components: PluginComponentGroup[];
    configuredOptions?: PluginOptionValues;
    dataPath: string;
    declaredMcpServerNames: string[];
    description?: string;
    enabled: boolean;
    homepage?: string;
    id: string;
    manifestPath: string;
    marketplace: string;
    mcpServerNames: string[];
    name: string;
    hookDetails: PluginHookDetail[];
    rootPath: string;
    skillCount: number;
    skillRootCount: number;
    source: PluginSource;
    userConfig?: Record<string, PluginUserConfigOption>;
    version?: string;
}
export interface PluginReferenceCatalogEntry {
    pluginId: string;
    name: string;
    marketplace: string;
    enabled: boolean;
    conflictingPluginIds: string[];
    skillQualifiedNames: string[];
    mcpServerNames: string[];
    subagentNames: string[];
    rootPath: string;
}
export interface PluginReferenceCatalog {
    plugins: PluginReferenceCatalogEntry[];
}
