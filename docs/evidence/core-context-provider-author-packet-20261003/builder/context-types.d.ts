import type { EnvInfo, Model, ModelInputMessage, ProjectContext, ResolvedUserInstructions, SkillLoadOutcome, UserInstructionsOptions } from "@knorvia/contracts";
import type { AutoCompactPolicyConfig } from "../compact/index.js";
import type { AgentProfile } from "../subagent/profile.js";
export type { EnvInfo, PackageManager, ProjectContext, ProjectType, ResolvedUserInstructionSource, ResolvedUserInstructions, UserInstructionsOptions, } from "@knorvia/contracts";
export type ContextSource = "cli_prefix" | "identity" | "env_info" | "system_context" | "skills" | "tools" | "request_user_context" | "memory" | "current_date" | "custom_system_prompt" | "workflow_actor_identity" | "subagent_agent_prompt" | "subagent_notes" | "subagent_environment" | "dynamic_behavior" | "session_guidance" | "output_style" | "context_management" | "desktop_context";
export type ContextInjectionTarget = "system" | "meta_user";
export type ContextCacheHint = "stable" | "dynamic";
export type PresentationSurface = "terminal" | "knorvia_desktop";
export interface ContextSection {
    name: string;
    source: ContextSource;
    injectionTarget: ContextInjectionTarget;
    cacheHint: ContextCacheHint;
    chars: number;
    tokens: number;
    content: string;
    preview: string;
}
export type ContextMetaUserAttachmentSource = "skills_listing" | "context_prefix";
export interface ContextMetaUserAttachment {
    source: ContextMetaUserAttachmentSource;
    content: string;
}
export interface ContextBuildResult {
    sections: ContextSection[];
    totalChars: number;
    totalTokens: number;
    systemMessages: ModelInputMessage[];
    metaUserAttachments: ContextMetaUserAttachment[];
}
export interface OutputStylePromptConfig {
    name: string;
    prompt: string;
    keepCodingInstructions?: boolean;
}
export interface ContextBuilderConfig {
    workingDirectory: string;
    envInfo: EnvInfo;
    model?: Model;
    presentationSurface?: PresentationSurface;
    currentDate?: string;
    userInstructions?: ResolvedUserInstructions;
    projectContext?: ProjectContext;
    memoryRoot?: string;
    memoryIndexContent?: string;
    skills?: SkillLoadOutcome;
    agentProfiles?: readonly AgentProfile[];
    embeddedSearchEnabled?: boolean;
    skillMetadataBudget?: number;
    customSystemPrompt?: string;
    workflowActor?: WorkflowActorContext;
    language?: string;
    outputStyle?: OutputStylePromptConfig;
    compact?: AutoCompactPolicyConfig;
    guidanceToolNames?: readonly string[];
}
export interface WorkflowActorContext {
    name?: string;
    persona?: string;
}
export type ContextUserInstructionsRequest = UserInstructionsOptions;
