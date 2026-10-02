import { type FileSystemPort, type SessionId, type TraceContext } from "@knorvia/contracts";
import { type RuntimeMessageEntry } from "../../agent/message-history.js";
export declare function writeApprovedPlanFile(input: {
    abortSignal?: AbortSignal;
    fileSystemPort: FileSystemPort;
    plan: string;
    sessionId: SessionId | string;
    traceContext?: TraceContext;
    workspaceRoot: string;
}): Promise<{
    path: string;
}>;
export declare function readApprovedPlanFileReferenceEntry(input: {
    abortSignal?: AbortSignal;
    fileSystemPort: FileSystemPort;
    sessionId: SessionId | string;
    traceContext?: TraceContext;
    workspaceRoot: string;
}): Promise<RuntimeMessageEntry | undefined>;
