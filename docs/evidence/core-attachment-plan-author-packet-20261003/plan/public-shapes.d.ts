// Body-free selected declaration fragments; owner-module boundaries retained.
// Referenced original imported types stay authoritative; fragments are not a standalone module.
// Original owner: apps/cli/packages/contracts/src/interfaces/shared.ts
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
export type PartId = string & {
    readonly __brand: "PartId";
};
// Original owner: apps/cli/packages/contracts/src/tracing/tracer.ts
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
// Original owner: apps/cli/packages/contracts/src/interfaces/file-system.port.ts
export type FileSystemErrorCode = "not_found" | "permission_denied" | "is_directory" | "not_file" | "too_large" | "stale_write" | "invalid_path" | "invalid_pattern" | "unsupported" | "cancelled" | "io_error";
export interface FileSystemErrorDetails {
    code: FileSystemErrorCode;
    path?: string;
    message: string;
    cause?: unknown;
}
export declare class FileSystemPortError extends Error {
    readonly code: FileSystemErrorCode;
    readonly path?: string;
    readonly cause?: unknown;
    constructor(details: FileSystemErrorDetails);
}
export declare function isFileSystemPortError(error: unknown): error is FileSystemPortError;
export type FileSystemNodeKind = "file" | "directory" | "symlink" | "other" | "missing";
export interface FileSystemRevision {
    id: string;
    mtimeMs?: number;
    sizeBytes?: number;
    hash?: string;
}
export type FileSystemLineEndings = "LF" | "CRLF";
export type FileSystemTextEncoding = BufferEncoding | "gb2312" | "gbk" | "gb18030";
export interface FileSystemStatRequest {
    path: string;
    trace?: TraceContext;
}
export interface FileSystemStatResult {
    path: string;
    kind: FileSystemNodeKind;
    sizeBytes: number;
    mtimeMs?: number;
    revision?: FileSystemRevision;
}
export interface FileSystemReadTextRequest {
    path: string;
    encoding?: FileSystemTextEncoding;
    maxBytes?: number;
    trace?: TraceContext;
}
export interface FileSystemReadTextResult {
    path: string;
    content: string;
    encoding: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    bytesRead: number;
    sizeBytes: number;
    truncated: boolean;
    revision?: FileSystemRevision;
}
export interface FileSystemReadTextRangeResult {
    path: string;
    content: string;
    encoding: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    bytesRead: number;
    sizeBytes: number;
    truncated: boolean;
    startLine: number;
    lineCount: number;
    totalLines: number;
    revision?: FileSystemRevision;
}
export interface FileSystemWriteTextRequest {
    path: string;
    content: string;
    encoding?: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    createParents?: boolean;
    atomic?: boolean;
    expectedRevision?: FileSystemRevision;
    trace?: TraceContext;
}
export interface FileSystemWriteTextResult {
    path: string;
    bytesWritten: number;
    revision?: FileSystemRevision;
}
export interface FileSystemOperationOptions {
    signal?: AbortSignal;
    context?: ExecutionContext;
}
export type RelevantFileSystemPort = Pick<import("@knorvia/contracts").FileSystemPort, "writeTextFile" | "readTextFile" | "stat">;
// Original owner: apps/cli/packages/contracts/src/errors/index.ts
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
export declare const CoreErrorType: typeof import("@knorvia/contracts").CoreErrorType;
export declare const PLAN_MODE_MAX_PLAN_CHARS: 20000;
export declare const READ_DEFAULT_MAX_LINES: 2000;
export declare const READ_MAX_FILE_SIZE_BYTES: number; // Contract value: 262144.
