# Stable fork anchor and workspace fork — functional/API-only packet

Author stable-fork-boundary.ts and workspace-fork.ts from this and api.json only.
No source/history/tests/oracles, other packets/services/agents. Save/hash before review.
All runtime/session/file/artifact ports and imported session-fork helpers unchanged.
No new transaction/retry/abort policy. Native async boundaries stay; do not cache live
runtime/store/option fields across gates. Fixed strings and stored formats retained.
Imports runtime constants/functions/types ../deps.js; helpers ../helpers/index.js;
AgentRuntimeInternal ../internal.js; fork/result types ../types.js. Public helper APIs
from ./session-fork.js available as declarations in dependency-api.json.

## Stable completion anchor

persistStableForkCompletionBoundary captures store=runtime.sessionStore; absent store
returns. Await store.messages({sessionID:runtime.sessionId}). Find LAST index satisfying
info.id===boundaryMessageId AND role assistant AND !error AND time.completed!==undefined.
Find LAST startMessageId occurrence with index<=boundaryIndex. If start<0,boundary<start,
or selected boundary not assistant/error/completed undefined, return; no fake anchor.

orderedMessageIds is slice(start,boundary+1).map(info.id) preserving branded refs/order.
Prefix string IDs from slice(0,boundary+1) populate Set. If typeof store.readTarget==='function',
await store.readTarget({sessionID:runtime.sessionId}); otherwise null. Truthy target
makes goalBoundary {kind:'snapshot',target:stable clone,verificationEntryIds:await verifier IDs};
falsy -> {kind:'none'}. Stable clone spreads target then overrides activeInputId:null,
activeRunStartedAtMs:null,activeRunLastSeenAtMs:null,time:{...target.time}. No current
parent execution capability in inherited target. Other fields shallowshared.

Verifier IDs: re-read runtime.sessionStore; !store?.sessionEntries -> native async []
(ACTUAL predecessor contract; do not make it throw based on narrative). Await sessionEntries
{sessionID:runtime.sessionId,type:SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION}. Iterate
in order; accept entry.data truthy object nonarray, nested payload likewise; normalize
only typeof string targetId/anchorAssistantMessageId into optional fields (no trims).
Keep entry.id if targetId===target.targetID and either falsy anchorAssistantMessageId
or prefix Set contains it. IDs not deduped. Getter/call/parse errors propagate.

After goal boundary settled construct MessageProjectionAnchor ordered spread boundary.info.anchor,
conditional truthy input.traceContext.turnId field,historyRoundCount,orderedMessageIds,
boundaryMessageId,goalBoundary. Await captured store.saveMessage({...boundary.info,anchor}).
No productTurnId construction; existing anchor extras shared. No abort handling/catch.
Concise original comments allowed; no old explanatory narrative.

## restoreWorkspaceCheckpointFiles

Absent runtime.fileSystemPort throws createCoreError(CoreErrorType.ConfigurationError,
'FileSystemPort is not configured',{recoverable:true}) BEFORE iteration/abort.
For files in order: throwIfTurnAborted(signal); if !file.existedBefore OR beforeContent===null,
await live fileSystemPort.removeFile({path:file.path,missingOk:true,trace:traceContext},
{signal}); then append {action:'delete',path:file.path}. Otherwise await writeTextFile
{path:file.path,content:file.beforeContent,createParents:true,atomic:true,trace:traceContext},
{signal}; append {action:'restore',bytesWritten:write.bytesWritten,path:file.path}.
No dedup/catch, no signal post-write check; previous effects remain on error. Array
results new, files untouched, path re-read after await. Empty files still guard port.

## forkWorkspaceAtMessage

1 Missing this.sessionStore -> ConfigurationError 'Fork requires a session adapter.',
context {hasSessionStore:false},recoverable:true. Await store.getSession(this.sessionId);
missing -> SessionNotFound `Session not found: ${this.sessionId}`,context{sessionId},recoverable:true.
Await store.messages({sessionID:this.sessionId}); forkSourceMessagesForSession(parentMessages,parentSession).
Find FIRST source message info.id===target. Missing -> InvalidStateTransition
`Fork target message not found in session store: ${target}`,context{messageId:target},recoverable:true.
resolveForkHistoryEndIndex(source,targetIndex,true). Await eventStore.getEvents(this.sessionId).
History IDs slice(0,end), get selectCheckpointsForMessages; Set checkpointIds. Later
IDs slice(end); selected later checkpoints filtered against history checkpoint IDs.
Order from unchanged helper; no local sort.

2 If no later checkpoints: return await forkConversationFromMessage.call(this,
{forkedSessionId:options.forkedSessionId,targetMessageId,traceContext}). Do not require
artifact/file ports or read abort in this path. If later and either missing artifactStore
or fileSystemPort, ConfigurationError 'Fork requires session, artifact, and file-system adapters.',
ordered context {hasArtifactStore:Boolean(this.artifactStore),hasFileSystemPort:Boolean(this.fileSystemPort),
hasSessionStore:true},recoverable:true.

3 For each later checkpoint: throwIfTurnAborted(options.abortSignal); await artifactStore
.readToolResultArtifact({uri:checkpoint.snapshotRef,trace:options.traceContext},{signal:
options.abortSignal}); JSON.parse read.content, parseWorkspaceCheckpointArtifact; collect
all before ANY session creation/copy/file effect. Exceptions propagate unchanged.
Then ordered Map path->FIRST file across artifacts/files; file refs retained, duplicates
ignored. This determines fork point before-images, no latest-wins behavior.

4 await createForkedSession(this,{forkedSessionId:options.forkedSessionId,parentSession}).
buildForkHistoryMessages(parentMessages,source,targetIndex,end); await this.copySessionMessagesForFork
{forkedSessionId,messages:history,traceContext}; keep copiedMessageCount,messageIdMap refs.
Await copyGoalStateForFork.call(this,{forkedSessionId,messageIdMap,traceContext}). Then
await restoreWorkspaceCheckpointFiles(this,Array.from(firstFiles.values()),traceContext,
options.abortSignal). Existing partial effects stay on later failure.

5 copiedTargetMessageId=messageIdMap.get(options.targetMessageId),created=Date.now();
await this.persistAssistantTimelinePartForSession ordered {sessionId:forkedSessionId,
messageID:createMessageId(),partID:createPartId(`fork_${String(this.sessionId)}_${String(options.targetMessageId)}_timeline`),
parentID:copiedTargetMessageId,created,completed:created,finish:'completed',timeline:
{timelineType:'session_fork',display:'separator',status:'completed',anchorMessageId:
copiedTargetMessageId,parentSessionId:this.sessionId,targetMessageId:options.targetMessageId,
restoredFileCount:restoredFiles.length,time:{start:created,end:created}},traceContext}.
Then await persistSyntheticUserNoticeForSession ordered messageID:createMessageId(),
sessionId:forkedSessionId,source:'fork',text:formatWorkspaceForkAtMessageNoticeBody
{parentSessionId:this.sessionId,restoredFiles,targetMessageId,undoneCheckpointCount:later.length},
metadata:{forkContext:{kind:'session_fork',parentSessionId:this.sessionId,targetMessageId,
restoredFileCount:restoredFiles.length}},traceContext.

6 Create event this.createEvent(SessionEventType.SessionForked,{originalSessionId:
this.sessionId,forkedSessionId,forkPoint:end,targetMessageId:options.targetMessageId,
restoredFileCount:restoredFiles.length,strategy:RewindStrategy.ForkRequired},traceContext).
Await appendEvent(event,traceContext). Return ordered copiedMessageCount,forkedSessionId,
parentSessionId:this.sessionId,targetMessageId:options.targetMessageId,restoredFiles,
response:`Forked session ${forkedSessionId} from message ${options.targetMessageId}: copied ${copiedMessageCount} messages and restored ${restoredFiles.length} file${restoredFiles.length===1?'':'s'} to the fork point.`
No additional gates/rollback/notifications. Use existing ports/functions, no live IO.
