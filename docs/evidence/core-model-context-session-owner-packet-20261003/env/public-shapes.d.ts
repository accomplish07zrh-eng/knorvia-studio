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
// Original type owner: apps/cli/packages/contracts/src/interfaces/context-source.port.ts
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
export interface EnvInfo {
    cwd: string;
    platform: string;
    shell: string;
    osVersion: string;
    nodeVersion: string;
    isGitRepository?: boolean;
    gitBranch?: string;
    gitMainBranch?: string;
    gitUser?: string;
    gitStatus?: "clean" | "dirty" | "not_repo";
    gitStatusLines?: string[];
    recentCommits?: string[];
}
// Original type owner: apps/cli/packages/contracts/src/model/model.ts
import type { JsonSchema, ModelInputMessage, ModelId, ModelProviderId, ModelStreamEvent, ModelTextResult, ModelToolContract } from "./index.js";
import { type ModelSelection } from "@knorvia/shared/model-selection";
import type { ModelPropertiesData, ModelOptionSpecsData } from "@knorvia/shared/model-config";
export type ModelOptionSpecs = ModelOptionSpecsData;
export type ModelProperties = ModelPropertiesData;
export interface ModelOptions {
    reasoningLevel?: string;
    maxOutputTokens?: number;
}
export interface ModelRequest {
    messages: ModelInputMessage[];
    tools?: ModelToolContract[];
    responseJsonSchema?: JsonSchema;
    options?: ModelOptions;
    abortSignal?: AbortSignal;
}
export type ModelResult = ModelTextResult;
export type ModelEvent = ModelStreamEvent;
export interface Model {
    readonly providerId: ModelProviderId;
    readonly modelId: ModelId;
    readonly displayName?: string;
    readonly properties: ModelProperties;
    readonly optionSpecs: ModelOptionSpecs;
    readonly options: ModelOptions;
    bind(options?: ModelOptions): Model;
    generateText(request: ModelRequest): Promise<ModelResult>;
    streamText(request: ModelRequest): AsyncIterable<ModelEvent>;
}
