// Original public type owner: apps/cli/packages/contracts/src/model/index.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { ProviderNativeToolSpec, ToolExecutionMode, ToolPermissionSpec, ToolResultBudget } from "../tools/contract.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { ModelApiCallObservation, ModelApiErrorPhase, ResolvedModelApiCallObservation } from "../telemetry/index.js";
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

// Original public type owner: apps/cli/packages/contracts/src/tools/read.ts
import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
export interface ReadTextOutput {
    type: "text";
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
    sizeBytes?: number;
    bytesRead?: number;
    truncated?: boolean;
    truncatedByTokenCap?: boolean;
    partialViewNotice?: string;
}
