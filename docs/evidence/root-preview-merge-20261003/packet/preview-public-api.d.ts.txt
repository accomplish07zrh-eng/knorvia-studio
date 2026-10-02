import { conversationArtifactTypeSchema, type ConversationArtifactType } from "./protocol-v4/rows.js";
export type ConversationPreviewFileKind = "markdown" | "html" | "docx" | "xlsx" | "pptx" | "pdf" | "video" | "audio";
export type ConversationPreviewArtifactType = ConversationArtifactType | "video" | "audio";
export interface ConversationPreviewFileReference {
    end: number;
    kind: ConversationPreviewFileKind;
    path: string;
    raw: string;
    start: number;
}
export interface ConversationPreviewFileChange {
    path: string;
    state?: "active" | "reverted";
}
export interface ConversationPreviewArtifactCandidate {
    artifactType: ConversationPreviewArtifactType;
    displayName: string;
    mimeType: string;
    previewKind: ConversationPreviewFileKind;
    productTurnId: string;
    sourceKind: "user_input_attachment" | "assistant_preview_card";
    sourceRef: string;
    requiresFileChanges: boolean;
}
interface PreviewFileTypeDefinition {
    extensions: readonly string[];
    kind: ConversationPreviewFileKind;
    mimeType: string;
    artifactType: ConversationPreviewArtifactType;
}
export declare const CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT = 15;
export declare const CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT = 10;
export declare function resolveConversationPreviewPath(workspacePath: string, rawPath: string): string | null;
export declare function getConversationPreviewFileType(path: string): PreviewFileTypeDefinition | null;
export declare function extractConversationPreviewFileReferences(content: string, workspacePath: string): ConversationPreviewFileReference[];
export declare function buildConversationPreviewArtifactCandidatesFromReferences(input: {
    references: readonly ConversationPreviewFileReference[];
    productTurnId: string;
    workspacePath: string;
    fileChanges?: readonly ConversationPreviewFileChange[];
    enforceWorkspaceBoundary?: boolean;
}): ConversationPreviewArtifactCandidate[];
export declare function buildConversationPreviewArtifactCandidates(input: {
    assistantText: string;
    productTurnId: string;
    workspacePath: string;
    fileChanges?: readonly ConversationPreviewFileChange[];
}): ConversationPreviewArtifactCandidate[];
export { conversationArtifactTypeSchema };
