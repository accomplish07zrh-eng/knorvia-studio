import type { MessageId, MessageWithParts } from "@knorvia/contracts";
import type { MemoryManifestEntry } from "./recall/types.js";
type MemoryExtractionExecutionStatus = "success" | "no-op" | "error" | "aborted";
export interface MemoryExtractionSnapshot {
    boundaryMessageId: MessageId;
    durableMessages: readonly MessageWithParts[];
    memoryRoot: string;
    workingDirectory: string;
    workspaceRoot: string;
}
interface MemoryExtractionExecutionInput {
    abortSignal: AbortSignal;
    messageCount: number;
    snapshot: MemoryExtractionSnapshot;
}
export interface MemoryExtractionScheduler<TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot> {
    drain(): Promise<void>;
    getCursor(): MessageId | undefined;
    hasPendingWork(): boolean;
    schedule(snapshot: TSnapshot | Promise<TSnapshot>): void;
    shutdown(): void;
}
export declare function buildMemoryExtractionPrompt(input: {
    manifest: readonly MemoryManifestEntry[];
    messageCount: number;
}): string;
export declare function createMemoryExtractionScheduler<TSnapshot extends MemoryExtractionSnapshot = MemoryExtractionSnapshot>(execute: (input: Omit<MemoryExtractionExecutionInput, "snapshot"> & {
    snapshot: TSnapshot;
}) => Promise<MemoryExtractionExecutionStatus>): MemoryExtractionScheduler<TSnapshot>;
export {};
