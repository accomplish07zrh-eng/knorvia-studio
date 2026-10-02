# Public compaction message and tracing fields

Source-derived public shapes only. Production imports are authoritative; these shapes do not replace dependency implementations. No bodies/tests are included. Other public model metadata may exist and must survive specified shallow projections. Branded tracing/tool IDs are deliberately qualified here, not plain-string aliases.

CompactModelMessage from compact/manual.js: role:string, content:ModelMessageContent, optional readonly toolCalls list of {name:string,input:unknown}. Local microcompact extends it as in public-api.d.ts, with mutable toolCalls including plain-string id, toolCallId/toolName/isError. Message/tool-call input objects can carry additional fields which survive shallow spread.

ModelMessageContent from @knorvia/contracts is string or a mutable array of public blocks:

```ts
interface AttachmentRef {
  id: string; kind: AttachmentKind; uri?: string; path?: string; mimeType?: string;
  sizeBytes?: number; sha256?: string; placeholder?: string;
}
interface ModelTextContentBlock { type: "text"; text: string }
interface ModelReasoningContentBlock { type: "reasoning"; text: string; providerOptions?: Record<string, unknown> }
interface ModelImageContentBlock { type: "image"; mediaType: string; dataUrl: string;
  detail?: "auto"|"low"|"high"|"original"; source?: AttachmentRef }
interface ModelVideoContentBlock { type: "video"; mediaType: string; dataUrl: string; source?: AttachmentRef }
interface ModelFileContentBlock { type: "file"; mediaType: string; name?: string;
  uri?: string; dataUrl?: string; text?: string; source?: AttachmentRef }
interface ModelResourceLinkContentBlock { type: "resource_link"; uri: string; name?: string; title?: string }
```

Block source/providerOptions objects are shallow-cloned only when specified; other nested references are preserved. AttachmentKind is an existing public enum/union irrelevant to this owner; do not redeclare/validate it or model content. Read-only tuple declarations do not imply a runtime frozen array.

LocalMicrocompactPolicyConfig has optional enabled:boolean,thresholdTokens:number,idleThresholdMinutes:number,keepRecentToolResults:number,compactableToolNames:readonly string[],clearErrorResults:boolean,minTokenSavings:number. Its full public declaration comes from microcompact.js, not an implementation body.

ToolCallId is string & {readonly __brand:"ToolCallId"}. MicrocompactBoundaryPayload has trigger:MicrocompactTrigger,strategy:MicrocompactStrategy,preMicrocompactTokenCount:number,postMicrocompactTokenCount:number,tokensSaved:number,clearedToolCallIds:ToolCallId[],keptToolCallIds:ToolCallId[],clearedMessageCount:number,traceId:TraceId,optional turnId:TurnId. Local payload omits traceId/turnId. Import real types; conventional assertion from known plain local call ids is permitted.

RuntimeMessageEntry public union from agent/message-history.js:

```ts
interface ModelInputMessage {
  role: "system"|"user"|"assistant"|"tool"; content: ModelMessageContent;
  cacheControl?: ModelCacheControl; toolCalls?: Array<{id:string,name:string,input:unknown}>;
  toolCallId?: string; toolName?: string; isError?: boolean;
  providerId?: Model["providerId"]; modelId?: Model["modelId"];
}
interface RuntimeMessageMetadata { source: RuntimeMessageSource; inputPresentation?: RuntimeInputPresentation }
interface RuntimeMessageMessageEntry {
  kind?: "message"; message: ModelInputMessage; metadata?: RuntimeMessageMetadata;
  tokens?: TokenUsageInfo; queryScope?: "output_token_continuation";
}
interface RuntimeAttachmentEntry {
  kind: "attachment"; content: string; cacheControl?: ModelCacheControl; metadata: RuntimeMessageMetadata;
}
type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
```

RuntimeMessageSource includes existing SystemReminderSource plus shared_context,real_user,legacy_synthetic. Relevant literal sources are context_prefix and skills_listing; other values are retained. Model/cache/token/presentation field types are opaque public metadata here; selection delegates actual cloning/provider projection and must not reconstruct them.

TraceContext is existing public interface with required traceId:TraceId and optional queryId:QueryId,spanId:string,parentSpanId:string,parentId:string,sessionId:SessionId,turnId:TurnId,attributes:Record<string,string|number|boolean>. TraceId/QueryId/SessionId/TurnId are branded string intersections with matching readonly __brand names. Only pass the context to actual traceContextToLogContext; do not create tracing IDs or substitute plain strings. LogContext is an existing public [key:string]:unknown object with optional log identity/status/etc fields; spread it unchanged before specified warning fields.
