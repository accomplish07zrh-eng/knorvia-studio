import type { PluginReferenceCatalog } from "@knorvia/contracts";
export declare const MAX_PLUGIN_REFERENCE_SKILLS = 32;
export declare const MAX_PLUGIN_REFERENCE_MCP_SERVERS = 16;
export declare const MAX_PLUGIN_REFERENCE_SUBAGENTS = 16;
export declare const MAX_PLUGIN_REFERENCE_REMINDER_BYTES: number;
export type PluginReferenceSkipReason = "unknown" | "ambiguous" | "disabled_in_session" | "no_live_capabilities" | "invalid_identifier";
export interface LivePluginSkill {
    qualifiedName: string;
    pluginName: string;
    rootPath: string;
    source: string;
}
export interface LivePluginMcpServer {
    serverName: string;
    connected: boolean;
    providerVisibleToolCount: number;
}
export interface LivePluginSubagent {
    name: string;
    path: string;
}
export interface BuildPluginReferenceReminderInput {
    references: readonly string[];
    catalog: PluginReferenceCatalog | undefined;
    liveSkills: readonly LivePluginSkill[];
    liveMcpServers: readonly LivePluginMcpServer[];
    liveSubagents?: readonly LivePluginSubagent[];
}
export interface PluginReferenceReminderDiagnostics {
    resolvedPluginIds: string[];
    skipped: Array<{
        pluginId: string;
        reason: PluginReferenceSkipReason;
    }>;
    skillCount: number;
    mcpServerCount: number;
    subagentCount: number;
    truncated: boolean;
}
export interface BuildPluginReferenceReminderResult {
    body: string | null;
    diagnostics: PluginReferenceReminderDiagnostics;
}
export declare function buildPluginReferenceReminderBody(input: BuildPluginReferenceReminderInput): BuildPluginReferenceReminderResult;
