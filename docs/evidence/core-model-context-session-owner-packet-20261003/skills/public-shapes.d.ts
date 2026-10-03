// Exact selected public type closure; no implementation.
// Original type owner: apps/cli/packages/core/src/context/types.ts
import type { EnvInfo, Model, ModelInputMessage, ProjectContext, ResolvedUserInstructions, SkillLoadOutcome, UserInstructionsOptions } from "@knorvia/contracts";
import type { AutoCompactPolicyConfig } from "../compact/index.js";
import type { AgentProfile } from "../subagent/profile.js";
export type ContextSource = "cli_prefix" | "identity" | "env_info" | "system_context" | "skills" | "tools" | "request_user_context" | "memory" | "current_date" | "custom_system_prompt" | "workflow_actor_identity" | "subagent_agent_prompt" | "subagent_notes" | "subagent_environment" | "dynamic_behavior" | "session_guidance" | "output_style" | "context_management" | "desktop_context";
export type ContextInjectionTarget = "system" | "meta_user";
export type ContextCacheHint = "stable" | "dynamic";
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
// Original type owner: apps/cli/packages/contracts/src/skills/index.ts
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
export type SkillScope = "project" | "user" | "system" | "admin";
export type SkillSource = "agents" | "knorvia" | "bundled" | "plugin" | "remote";
export type SkillDiagnosticSeverity = "warning" | "error";
export type SkillDiagnosticCode = "skill_root_not_found" | "skill_scan_failed" | "skill_read_failed" | "skill_missing_frontmatter" | "skill_invalid_frontmatter" | "skill_missing_name" | "skill_invalid_name" | "skill_missing_description" | "skill_description_too_long" | "skill_unknown_frontmatter" | "skill_duplicate_name" | "skill_too_large" | "skill_not_found";
export interface SkillPolicy {
    allowImplicitInvocation?: boolean;
}
export interface SkillMetadata {
    name: string;
    description: string;
    whenToUse?: string;
    pluginName?: string;
    pluginId?: string;
    qualifiedName?: string;
    path: string;
    directory: string;
    rootPath: string;
    scope: SkillScope;
    source: SkillSource;
    safeToAutoLoad: boolean;
    frontmatterKeys: string[];
    policy?: SkillPolicy;
}
export interface SkillDiagnostic {
    code: SkillDiagnosticCode;
    severity: SkillDiagnosticSeverity;
    message: string;
    path?: string;
    skillName?: string;
}
export interface SkillLoadOutcome {
    skills: SkillMetadata[];
    diagnostics: SkillDiagnostic[];
    totalDiscovered: number;
}
