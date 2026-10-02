// Selected original public type closure; no implementation.
// Original type owner: apps/cli/packages/contracts/src/interfaces/file-system.port.ts
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";
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
export interface FileSystemCreateDirectoryRequest {
    path: string;
    trace?: TraceContext;
}
export interface FileSystemCreateDirectoryResult {
    path: string;
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
export interface FileSystemReadBytesRequest {
    path: string;
    maxBytes?: number;
    trace?: TraceContext;
}
export interface FileSystemReadBytesResult {
    path: string;
    content: Uint8Array;
    bytesRead: number;
    sizeBytes: number;
    revision?: FileSystemRevision;
}
export interface FileSystemReadTextRangeRequest {
    path: string;
    encoding?: FileSystemTextEncoding;
    offsetLine?: number;
    limitLines?: number;
    maxBytes?: number;
    trace?: TraceContext;
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
export interface FileSystemRemoveFileRequest {
    path: string;
    missingOk?: boolean;
    trace?: TraceContext;
}
export interface FileSystemRemoveFileResult {
    path: string;
    removed: boolean;
}
export interface FileSystemListDirectoryRequest {
    path: string;
    trace?: TraceContext;
}
export interface FileSystemListDirectoryEntry {
    kind: FileSystemNodeKind;
    name: string;
    path: string;
}
export interface FileSystemListDirectoryResult {
    durationMs: number;
    entries: FileSystemListDirectoryEntry[];
    numEntries: number;
    path: string;
}
export interface FileSystemSearchFilesRequest {
    path: string;
    pattern: string;
    maxResults?: number;
    offset?: number;
    trace?: TraceContext;
}
export interface FileSystemSearchFilesResult {
    path: string;
    pattern: string;
    durationMs: number;
    files: string[];
    numFiles: number;
    truncated: boolean;
}
export type FileSystemTextSearchOutputMode = "content" | "files_with_matches" | "count";
export interface FileSystemSearchTextRequest {
    path: string;
    pattern: string;
    glob?: string;
    outputMode?: FileSystemTextSearchOutputMode;
    beforeContext?: number;
    afterContext?: number;
    context?: number;
    showLineNumbers?: boolean;
    onlyMatching?: boolean;
    ignoreCase?: boolean;
    type?: string;
    headLimit?: number;
    offset?: number;
    multiline?: boolean;
    trace?: TraceContext;
}
export interface FileSystemSearchTextEntry {
    path: string;
    lineNumber?: number;
    text?: string;
    count?: number;
    matched?: boolean;
}
export interface FileSystemSearchTextResult {
    path: string;
    pattern: string;
    mode: FileSystemTextSearchOutputMode;
    durationMs: number;
    files: string[];
    entries: FileSystemSearchTextEntry[];
    numMatches: number;
    truncated: boolean;
    appliedLimit?: number;
    appliedOffset?: number;
}
export interface FileSystemOperationOptions {
    signal?: AbortSignal;
    context?: ExecutionContext;
}
export interface FileSystemPort {
    createDirectory(request: FileSystemCreateDirectoryRequest, options?: FileSystemOperationOptions): Promise<FileSystemCreateDirectoryResult>;
    stat(request: FileSystemStatRequest, options?: FileSystemOperationOptions): Promise<FileSystemStatResult>;
    readTextFile(request: FileSystemReadTextRequest, options?: FileSystemOperationOptions): Promise<FileSystemReadTextResult>;
    readBinaryFile(request: FileSystemReadBytesRequest, options?: FileSystemOperationOptions): Promise<FileSystemReadBytesResult>;
    readTextFileRange(request: FileSystemReadTextRangeRequest, options?: FileSystemOperationOptions): Promise<FileSystemReadTextRangeResult>;
    writeTextFile(request: FileSystemWriteTextRequest, options?: FileSystemOperationOptions): Promise<FileSystemWriteTextResult>;
    removeFile(request: FileSystemRemoveFileRequest, options?: FileSystemOperationOptions): Promise<FileSystemRemoveFileResult>;
    listDirectory(request: FileSystemListDirectoryRequest, options?: FileSystemOperationOptions): Promise<FileSystemListDirectoryResult>;
    searchFiles(request: FileSystemSearchFilesRequest, options?: FileSystemOperationOptions): Promise<FileSystemSearchFilesResult>;
    searchText(request: FileSystemSearchTextRequest, options?: FileSystemOperationOptions): Promise<FileSystemSearchTextResult>;
}
// Original type owner: apps/cli/packages/core/src/memory/recall/types.ts
export type MemoryRecallType = (typeof MEMORY_RECALL_TYPES)[number];
export interface MemoryManifestEntry {
    description?: string;
    filePath: string;
    filename: string;
    mtimeMs: number;
    type?: MemoryRecallType;
}
