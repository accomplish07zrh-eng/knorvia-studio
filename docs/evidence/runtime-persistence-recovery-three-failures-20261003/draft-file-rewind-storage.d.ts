import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export type FileState = {
    content: string | null;
    exists: boolean;
    hash: string;
};
export type ReadFailure = {
    reason: "file_read_failed";
    message: string;
};
export type JournalRecord = {
    path: string;
    state: FileState;
};
export declare function contentHash(content: string | null): string;
export declare function errorMessage(error: unknown): string;
export declare function readCurrentState(runtime: AgentRuntimeInternal, path: string, trace: TraceContext, signal?: AbortSignal): Promise<FileState | ReadFailure>;
export declare function compensate(runtime: AgentRuntimeInternal, journal: JournalRecord[], trace: TraceContext): Promise<void>;
//# sourceMappingURL=file-rewind-storage.d.ts.map