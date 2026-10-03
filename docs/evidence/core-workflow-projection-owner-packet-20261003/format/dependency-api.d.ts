// Selected public reference types/ports only; opaque actual schemas and helpers, no standalone semantic closure.
// Original public port/type owner: apps/cli/packages/contracts/src/tools/get-workflow-run.ts
import { z } from "zod";
export declare const GetWorkflowRunOutputSchema: any;
export type GetWorkflowRunOutput = z.infer<typeof GetWorkflowRunOutputSchema>;

// Original public port/type owner: apps/cli/packages/contracts/src/model/index.ts
export type ModelMessageContent = string | ModelMessageContentBlock[];
export type ModelMessageContentBlock = ModelTextContentBlock | ModelReasoningContentBlock | ModelImageContentBlock | ModelVideoContentBlock | ModelFileContentBlock | ModelResourceLinkContentBlock;
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
export type AttachmentKind = "local_file" | "resource" | "inline";
export interface ModelVideoContentBlock {
    type: "video";
    mediaType: string;
    dataUrl: string;
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
export interface ModelResourceLinkContentBlock {
    type: "resource_link";
    uri: string;
    name?: string;
    title?: string;
}

// Original public port/type owner: apps/cli/packages/core/src/runtime-task/notification.ts

// Original public port/type owner: apps/cli/packages/core/src/runtime-task/workflow-notification-copy.ts
import type { DynamicWorkflowRunError } from "@knorvia/contracts";
export declare function formatWorkflowProviderStopError(failure: DynamicWorkflowRunError, runId: string): string;

// Original public port/type owner: apps/cli/packages/core/src/tool/executor/workflow-published-artifacts.ts
export declare function formatPublishedArtifactLine(artifact: PublishedArtifactSummary): string;
interface PublishedArtifactSummary {
    id: string;
    kind: string;
    version: number;
    title?: string;
    contentType?: string;
    bytes?: number;
    itemCount?: number;
    primary?: true;
    description?: string;
}

// Original public port/type owner: apps/cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.ts
import type { GetWorkflowRunOutput } from "@knorvia/contracts";
export declare function formatWorkflowRunHealthBlock(run: GetWorkflowRunOutput, terminal: boolean): string;
export declare function formatWorkflowRunPhasesBlock(run: GetWorkflowRunOutput, terminal: boolean): string | undefined;
export declare function formatWorkflowRunSubagentsBlock(run: GetWorkflowRunOutput): string;
export declare function formatWorkflowRunLogTailBlock(run: GetWorkflowRunOutput): string;

// Original public port/type owner: apps/cli/packages/core/src/tool/handlers/workflow-run-introspection.ts
export declare function formatRelativeAge(now: number, at: number | undefined): string | undefined;
export declare function formatWorkflowRunInstant(now: number, at: number): string;
export declare function formatWorkflowRunTimestamp(epochMs: number): string;
export declare function workflowRunAttribute(name: string, value: string | number | boolean): string;

// Original public port/type owner: apps/cli/packages/core/src/runtime-task/notification.ts
export declare function escapeXml(value: string): string;

// Original public alias owner: workflow-run-introspection.ts
export { escapeXml as escapeWorkflowRunText };
