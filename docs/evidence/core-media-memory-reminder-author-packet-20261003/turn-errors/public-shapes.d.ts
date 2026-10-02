// Selected actual shapes and opaque authoritative owner types. No dependency implementation.
// Original type owner: apps/cli/packages/contracts/src/interfaces/shared.ts
export type SessionId = string & {
    readonly __brand: "SessionId";
};
export type TurnId = string & {
    readonly __brand: "TurnId";
};
export type ToolCallId = string & {
    readonly __brand: "ToolCallId";
};
export type MessageId = string & {
    readonly __brand: "MessageId";
};
// Original type owner: apps/cli/packages/contracts/src/tracing/tracer.ts
export interface TraceContext {
    traceId: TraceId;
    queryId?: QueryId;
    spanId?: string;
    parentSpanId?: string;
    parentId?: string;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
}
// Original type owner: apps/cli/packages/contracts/src/model/index.ts
export type ModelMessageRole = "system" | "user" | "assistant" | "tool";
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export type AttachmentKind = "local_file" | "resource" | "inline";
export interface AttachmentRef {
    id: string;
    kind: AttachmentKind;
    uri?: string;
    path?: string;
    mimeType?: string;
    sizeBytes?: number;
    sha256?: string;
    placeholder?: string;
}
export interface ModelTextContentBlock {
    type: "text";
    text: string;
}
export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelImageContentBlock {
    type: "image";
    mediaType: string;
    dataUrl: string;
    detail?: "auto" | "low" | "high" | "original";
    source?: AttachmentRef;
}
export interface ModelFileContentBlock {
    type: "file";
    mediaType: string;
    name?: string;
    uri?: string;
    dataUrl?: string;
    text?: string;
    source?: AttachmentRef;
}
export interface ModelVideoContentBlock {
    type: "video";
    mediaType: string;
    dataUrl: string;
    source?: AttachmentRef;
}
export interface ModelResourceLinkContentBlock {
    type: "resource_link";
    uri: string;
    name?: string;
    title?: string;
}
export type ModelMessageContentBlock = ModelTextContentBlock | ModelReasoningContentBlock | ModelImageContentBlock | ModelVideoContentBlock | ModelFileContentBlock | ModelResourceLinkContentBlock;
export type ModelMessageContent = string | ModelMessageContentBlock[];
export interface ModelCacheControl {
    type: "ephemeral";
    ttl?: "5m" | "1h";
    scope?: "global" | "org";
}
export interface ModelInputMessage {
    role: ModelMessageRole;
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ModelToolCall[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: ModelProviderId;
    modelId?: ModelId;
}
export interface ModelToolContract {
    name: string;
    description?: string;
    capability?: string;
    executionMode?: ToolExecutionMode;
    providerNative?: ProviderNativeToolSpec;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    strict?: boolean;
    readOnly?: boolean;
    destructive?: boolean;
    concurrentSafe?: boolean;
    requiresUserInteraction?: boolean;
    maxOutputBytes?: number;
    timeoutMs?: number;
    needsApproval?: boolean;
    sideEffectScope?: ModelToolSideEffectScope;
    permission?: ToolPermissionSpec;
    resultBudget?: ToolResultBudget;
    execute?: (input: unknown, context: ModelToolExecutionContext) => Promise<unknown> | unknown;
}
export type AgentRuntimeInternal = import("../internal.js").AgentRuntimeInternal;
export type Model = import("../deps.js").Model;
export type AgentRuntimeConfig = import("../deps.js").AgentRuntimeConfig;
export type ModelApiOperation = import("@knorvia/contracts").ModelApiOperation;
// Original type owner: apps/cli/packages/contracts/src/telemetry/agent-execution.ts
export interface AgentTelemetryCausation {
    isRemote: boolean;
    spanId: string;
    traceFlags: number;
    traceId: string;
    traceState?: string;
    sessionId?: string;
    turnId?: string;
    toolCallId?: string;
}
export interface AgentTelemetryScope {
    captureCausation(): AgentTelemetryCausation | undefined;
    run<T>(execute: () => T): T;
}
// Callback/state member contracts remain authoritative through AgentRuntimeInternal; contract prose lists used observations.
// Original type owner: apps/cli/packages/contracts/src/errors/index.ts
interface Options {
    cause?: Error;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
}
export interface CoreError extends Error {
    type: CoreErrorType;
    code: string;
    message: string;
    cause?: Error;
    context?: Record<string, unknown>;
    recoverable: boolean;
    retryable: boolean;
    timestamp: Date;
}
export declare function createCoreError(type: CoreErrorType, message: string, options?: Options): CoreError;
export declare function isCoreError(error: unknown): error is CoreError;
// Original type owner: apps/cli/packages/core/src/errors/error-payload.ts
export declare function withErrorPayloadRole(context: Record<string, unknown> | undefined, role: ErrorPayloadRole): Record<string, unknown>;
export declare function projectExecutionErrorPayload(error: unknown, fallbackMessage?: any): any;
export declare const CoreErrorType: typeof import("../deps.js").CoreErrorType;
export declare const SessionEventType: typeof import("../deps.js").SessionEventType;
export declare const ErrorPayloadRole: typeof import("../../errors/error-payload.js").ErrorPayloadRole;
export declare const createModelUsageSummaryFromEvents: typeof import("../deps.js").createModelUsageSummaryFromEvents;
export declare const traceContextToLogContext: typeof import("../deps.js").traceContextToLogContext;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/model-errors.ts
export declare function isModelContextExceededError(error: unknown): boolean;
export type SessionEvent=import("../deps.js").SessionEvent;
