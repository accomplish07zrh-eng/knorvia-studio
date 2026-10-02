// Body-free supporting port/type facts; actual existing imports remain authoritative.
export type WorkspaceFileRewindAction = "restore" | "delete";
export type WorkspaceFileRewindUnsafeReason = "checkpoint_missing" | "checkpoint_unreadable" | "external_modified" | "file_read_failed" | "unsupported_checkpoint";
export interface WorkspaceFileRewindSafeFile {
    action: WorkspaceFileRewindAction;
    operationCount: number;
    path: string;
    toolNames: string[];
}
export interface WorkspaceFileRewindUnsafeFile {
    currentHash?: string;
    expectedHash?: string;
    message?: string;
    operationCount: number;
    path: string;
    reason: WorkspaceFileRewindUnsafeReason;
    toolNames: string[];
}
export interface WorkspaceFileRewindIgnoredFile {
    operationCount: number;
    path: string;
    reason: "bash_ignored";
    toolNames: string[];
}
export interface WorkspaceFileRewindPreview {
    canApply: boolean;
    ignoredFiles: WorkspaceFileRewindIgnoredFile[];
    safeFiles: WorkspaceFileRewindSafeFile[];
    unsafeFiles: WorkspaceFileRewindUnsafeFile[];
}
export interface WorkspaceFileRewindApplyResult {
    applied: boolean;
    preview: WorkspaceFileRewindPreview;
    response: string;
}
// Public dependency shapes; brands are aliases here only as reference facts, not new public exports.
type MessageId = string; type TurnId = string;
type TraceContext = Record<string, unknown>;
type WorkspaceCheckpointArtifact = {version:1;kind:'workspace_file_before_change';createdAt:string;toolCallId:string;toolName:string;files:Array<{path:string;existedBefore:boolean;beforeContent:string|null;afterContent?:string;afterContentLength?:number;structuredPatch:Array<{oldStart:number;oldLines:number;newStart:number;newLines:number;lines:string[]}>}>};
type CheckpointCreatedPayload = {checkpointId:string;snapshotRef:string;fileCount?:number;scope:string;messageId?:MessageId;[key:string]:unknown};
interface AgentRuntimeInternal {
 rootTraceContext:TraceContext;workspaceRoot:string;sessionId:string;
 eventStore:{getEvents(id:string):Promise<readonly unknown[]>};
 artifactStore?:{readToolResultArtifact(input:{uri:string;trace:TraceContext},options:{signal?:AbortSignal}):Promise<{content:string}>};
 fileSystemPort?:{
  readTextFile(input:{path:string;trace:TraceContext},options?:{signal?:AbortSignal}):Promise<{content:string}>;
  writeTextFile(input:{path:string;content:string;createParents:true;atomic:true;trace:TraceContext},options?:{signal?:AbortSignal}):Promise<unknown>;
  removeFile(input:{path:string;missingOk:true;trace:TraceContext},options?:{signal?:AbortSignal}):Promise<unknown>;
 };
 createEvent(type:unknown,payload:unknown,trace:TraceContext):unknown;
 appendEvent(event:unknown,trace:TraceContext):Promise<unknown>;
 logger?:{info(message:string,fields:unknown):void};
}
// Actual imports supply richer branded types; do not change them from these reference simplifications.
declare function selectCheckpointForRewind(events:readonly unknown[],id?:string):CheckpointCreatedPayload|undefined;
declare function selectCheckpointsForMessages(events:readonly unknown[],ids:Iterable<MessageId>):CheckpointCreatedPayload[];
declare function throwIfTurnAborted(signal?:AbortSignal):void;
declare function parseWorkspaceCheckpointArtifact(input:unknown):WorkspaceCheckpointArtifact;
declare function getCurrentTraceContext():TraceContext|undefined;
declare function traceContextToLogContext(trace:TraceContext):Record<string,unknown>;
declare function isFileSystemPortError(error:unknown):error is {code:string};
