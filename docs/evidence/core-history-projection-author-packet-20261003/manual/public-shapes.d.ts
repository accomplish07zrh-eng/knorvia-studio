export type ModelProviderId = string & {
    readonly __brand: "ModelProviderId";
};
export type ModelId = string & {
    readonly __brand: "ModelId";
};
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

export interface TokenUsageInfo {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
}

// Existing Model has these provider selection properties among other metadata:
// providerId: ModelProviderId; modelId: ModelId. Import actual Model type.
// RuntimeInputPresentation is the existing union user_steer,coordinator_steer,
// coordinator_input,subagent_reply_steer,subagent_reply,task_notification_steer,task_notification.
// TraceId, TurnId, QueryId, SessionId, MessageId are branded string intersections:
// string & { readonly __brand: matching type name }. Import actual contract types.
// TraceContext: traceId:TraceId; queryId?:QueryId; spanId?:string;
// parentSpanId?:string; parentId?:string; sessionId?:SessionId; turnId?:TurnId;
// attributes?:Record<string,string|number|boolean>.

// Existing CompactTrigger runtime constant has readonly Manual:"manual",Auto:"auto",
// Partial:"partial",Reactive:"reactive",SessionMemory:"session_memory"; type is value union.
// CompactPhase values standalone_turn,pre_request,mid_turn,reactive.
// CompactReason values user_requested,context_limit,model_downshift,provider_overflow.
// CompactPreservedSegment has headMessageId,anchorMessageId,tailMessageId: MessageId.
// CompactBoundaryPayload: boundaryId:string;trigger:CompactTrigger;
// phase?:CompactPhase;compactReason?:CompactReason;summarySource?:"model"|"session_memory";
// preCompactTokenCount:number;postCompactTokenCount?:number;truePostCompactTokenCount?:number;
// autoCompactThreshold?:number;willRetriggerNextTurn?:boolean;summarizedMessageCount:number;
// keptMessageCount?:number;lastSummarizedMessageId?:MessageId;preservedSegment?:CompactPreservedSegment;
// summaryMessageIds:MessageId[];attachmentMessageIds?:string[];hookResultMessageIds?:string[];
// preCompactDiscoveredTools?:string[];customInstructions?:boolean;traceId:TraceId;turnId?:TurnId;
// spanId?:string;parentSpanId?:string. No parsing/schema invocation belongs in manual utilities.
