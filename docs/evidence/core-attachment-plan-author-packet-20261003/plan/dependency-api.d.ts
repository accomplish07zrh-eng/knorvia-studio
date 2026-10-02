// Distinct unchanged collaborator surfaces; no dependency implementation.
// Original owner: apps/cli/packages/core/src/agent/message-history.ts
export type RuntimeMessageSource = SystemReminderSource | "shared_context" | "real_user" | "legacy_synthetic";
export interface RuntimeMessageMetadata {
    source: RuntimeMessageSource;
    inputPresentation?: RuntimeInputPresentation;
}
export interface RuntimeMessageMessageEntry {
    kind?: "message";
    message: ModelInputMessage;
    metadata?: RuntimeMessageMetadata;
    tokens?: TokenUsageInfo;
    queryScope?: "output_token_continuation";
}
export interface RuntimeAttachmentEntry {
    kind: "attachment";
    content: string;
    cacheControl?: ModelCacheControl;
    metadata: RuntimeMessageMetadata;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export declare function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry;
export declare const join: typeof import("node:path").join;
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
