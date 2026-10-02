import { EXPLORE_AGENT_TYPE } from "./explore.js";
import type { ModelSelection } from "@knorvia/shared";
export declare const DEFAULT_SUBAGENT_TYPE: "general-purpose";
export type BuiltInSubagentModelSelectionOverrides = Partial<Record<typeof DEFAULT_SUBAGENT_TYPE | typeof EXPLORE_AGENT_TYPE, ModelSelection>>;
export type AgentPermissionMode = "auto" | "plan";
export type AgentProfileSource = "built-in" | "project" | "user";
export type AgentMemoryScope = "user" | "project" | "local";
export interface AgentProfile {
    background?: boolean;
    color?: "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "pink" | "cyan";
    description: string;
    disallowedTools?: readonly string[];
    injectAgentsMd?: boolean;
    maxTurns?: number;
    mcpServers?: readonly string[];
    memory?: AgentMemoryScope;
    modelSelection?: ModelSelection;
    name: string;
    path?: string;
    permissionMode?: AgentPermissionMode;
    skills?: readonly string[];
    source: AgentProfileSource;
    systemPrompt: string;
    tools?: readonly string[];
}
export interface AgentProfileParseDiagnostic {
    code: string;
    message: string;
    path?: string;
}
export interface AgentProfileLoadResult {
    diagnostics: AgentProfileParseDiagnostic[];
    profiles: AgentProfile[];
}
export declare function createBuiltInExploreAgentProfile(options?: {
    modelSelection?: ModelSelection;
}): AgentProfile;
export declare function isBuiltInExploreAgentProfile(profile: Pick<AgentProfile, "name" | "source">): boolean;
export declare function normalizeAgentProfiles(profiles: readonly AgentProfile[], options?: {
    builtInModelSelectionOverrides?: BuiltInSubagentModelSelectionOverrides;
}): AgentProfile[];
export declare function createBuiltInGeneralPurposeAgentProfile(options?: {
    modelSelection?: ModelSelection;
}): AgentProfile;
export declare function formatAgentProfilesForPrompt(profiles: readonly AgentProfile[], options?: {
    embeddedSearchEnabled?: boolean;
}): string | null;
export declare function parseAgentProfileFromMarkdown(input: {
    content: string;
    path?: string;
    source: AgentProfileSource;
}): {
    diagnostic?: AgentProfileParseDiagnostic;
    profile?: AgentProfile;
};
export declare function agentProfileDisplayName(profile: AgentProfile): string;
