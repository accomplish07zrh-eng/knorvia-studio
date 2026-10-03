import { type MessageWithParts, type ReadSessionContextInput, type ReadSessionContextOutput, type ReadSessionContextReference, type SessionInfo } from "@knorvia/contracts";
export { buildReferencedSessionContextReminderBody, extractSessionReferences, } from "./references.js";
export interface SessionContextMaterial {
    allContent: string;
    allContentChars: number;
    chunks: TranscriptChunk[];
    localContent: string;
    messageCount: number;
    readableMessageCount: number;
    references: ReadSessionContextReference[];
    selectedChunks: TranscriptChunk[];
    selectedMessageCount: number;
    truncated: boolean;
}
export interface TranscriptChunk {
    index: number;
    startMessageIndex: number;
    endMessageIndex: number;
    messageCount: number;
    content: string;
    searchText: string;
    score: number;
    references: ReadSessionContextReference[];
}
export declare function buildSessionContextMaterial(input: {
    messages: MessageWithParts[];
    query: string;
    session: SessionInfo;
    strategy: ReadSessionContextInput["strategy"];
    outputCharBudget?: number;
}): SessionContextMaterial;
export declare function formatReadSessionContextModelContent(output: ReadSessionContextOutput): string;
export declare function formatLocalSessionNotFound(input: {
    query: string;
    sessionId: string;
    strategy: ReadSessionContextInput["strategy"];
}): ReadSessionContextOutput;
export declare function outputCharBudgetFromMaxTokens(maxTokens: number | undefined): number;
export declare function liteInputCharBudget(): number;
export declare function maxLiteChunks(): number;
