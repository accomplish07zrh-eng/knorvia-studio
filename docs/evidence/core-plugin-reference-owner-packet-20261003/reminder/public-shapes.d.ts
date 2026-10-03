// Original public type owner: apps/cli/packages/contracts/src/plugins/index.ts
import type { CustomCommandRoot } from "../commands/index.js";
import type { HookEventName, HookMatcherConfig } from "../hooks/index.js";
import type { McpServerConfig } from "../interfaces/mcp.port.js";
import type { SkillRoot } from "../skills/index.js";
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
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
