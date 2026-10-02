// Public dependencies stay opaque at original owners; not standalone compilation.
// Original type owner: apps/cli/packages/core/src/runtime/helpers/tool-result.ts
import type { ModelMessageContent, ToolCallId, ToolSchedule, ToolExecutionResult } from "../deps.js";
export declare function modelContentForToolResult(result: ToolExecutionResult): ModelMessageContent;
export declare function isErrorForToolResult(result: ToolExecutionResult): boolean;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/media-budget.ts
import type { Logger, ModelInputFormat, ModelInputMessage, TraceContext } from "../deps.js";
import { type MediaCapabilityProjection } from "./media-capability.js";
export interface MediaBudgetProjection {
    messages: ModelInputMessage[];
    omittedMediaCount: number;
    projectedMediaBytes: number;
    retainedMediaCount: number;
    totalMediaBytes: number;
}
interface ModelMediaPolicyProjection {
    capabilityProjection: MediaCapabilityProjection;
    mediaBudgetProjection: MediaBudgetProjection;
    messages: ModelInputMessage[];
}
export declare function projectMessagesForModelMediaPolicy(messages: ModelInputMessage[], inputFormat: ModelInputFormat, options?: {
    latestRealUserMessageIndex?: number;
}): ModelMediaPolicyProjection;
// Original type owner: apps/cli/packages/core/src/tool/handlers/bash-command-parser.ts
import type { Redirect } from "unbash";
export type BashCommandOperator = "&&" | "||" | "|" | "|&" | "sequence";
export interface BashCommandEnvAssignment {
    readonly name: string | undefined;
    readonly value: string | undefined;
}
export interface BashCommandRedirect {
    readonly fileDescriptor: number | undefined;
    readonly operator: Redirect["operator"];
    readonly target: string;
}
export interface BashCommandInvocation {
    readonly argv: string[];
    readonly commandText: string;
    readonly envAssignments: BashCommandEnvAssignment[];
    readonly hasAssignmentPrefix: boolean;
    readonly hasDynamicWords: boolean;
    readonly hasRedirects: boolean;
    readonly name: string;
    readonly operatorBefore?: BashCommandOperator;
    readonly redirects: BashCommandRedirect[];
}
export interface BashCommandAnalysis {
    readonly commands: BashCommandInvocation[];
    readonly hasDynamicWords: boolean;
    readonly hasParseErrors: boolean;
    readonly hasRedirects: boolean;
    readonly hasUnsupportedSyntax: boolean;
    readonly unsupportedNodeTypes: string[];
}
export declare function analyzeBashCommand(command: string): BashCommandAnalysis;
export declare function isBashCommandPermissionSafe(analysis: BashCommandAnalysis): boolean;
// Original type owner: apps/cli/packages/core/src/tool/handlers/bash-semantics.ts
import type { ExecutionResult } from "@knorvia/contracts";
import { type BashReadonlyRuntimeContext } from "./bash-git-runtime-safety.js";
export declare function isRuntimeReadOnlyBashCommand(command: string, context?: BashReadonlyRuntimeContext): boolean;
// Original type owner: apps/cli/packages/core/src/memory/memory-file-path.ts
export declare function resolveContainedMemoryFilePath(input: {
    filePath: string;
    rootDir: string;
    workingDirectory: string;
    workspaceRoot: string;
}): string | undefined;
export declare function resolveSafeMemoryFilePath(input: {
    filePath: string;
    rootDir: string;
    workingDirectory: string;
    workspaceRoot: string;
}): string | undefined;
// Original type owner: apps/cli/packages/core/src/model/auxiliary-model-options.ts
import type { Model, ModelOptions } from "@knorvia/contracts";
export declare function auxiliaryModelOptions(model: Model): Required<ModelOptions>;
