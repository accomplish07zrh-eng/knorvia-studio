# Checkpoint history and checkpoint-target fork — body-free functional packet

Read only this contract/api.d.ts. Implement workspace-checkpoints.ts <=400 lines.
No predecessor/history/tests/oracles/other packets or production/live IO. Save/hash
before comparison. Source-exposed curator derives these functional facts. No policy,
new lock/cache/retry/transaction; preserve native async public functions and return-await.
Accepted restore/fork/goal dependencies stay unchanged; relocation is not originality.

Imports: ../deps.js public API types, CoreErrorType/RewindScope/RewindStrategy/SessionEventType,
createCoreError/createMessageId/createPartId/getCurrentTraceContext/parseCheckpointCreatedPayload/
parseWorkspaceCheckpointArtifact; ../internal.js AgentRuntimeInternal; ../types.js result
and summary types; ../helpers/index.js selectCheckpointForRewind(events,target?),
previewTextFromMessage, formatWorkspaceForkNoticeBody({checkpoint,parentSessionId,restoredFiles}),
cloneMessageForFork(info,{forkedSessionId,messageIdMap,nextMessageId}), clonePartForFork
(part,{forkedSessionId,nextMessageId,messageIdMap}). ./session-fork.js unchanged
buildForkHistoryMessages(parentMessages,source,targetIndex,end),copyGoalStateForFork.call
(runtime,{forkedSessionId,messageIdMap,traceContext}),createForkedSession(runtime,
{forkedSessionId,parentSession}),forkSourceMessagesForSession,resolveForkHistoryEndIndex.
./workspace-fork.js forkWorkspaceAtMessage.call(runtime,options) and
restoreWorkspaceCheckpointFiles(runtime,files,trace,signal). Public API in api.d.ts.

## Restore/copy/list/preview

restoreWorkspaceCheckpointArtifact simply return-await unchanged restore files dependency
with runtime,artifact.files,trace,signal. This constrained wrapper earns no reconstruction
credit. copySessionMessagesForFork: no store -> {copiedMessageCount:0,messageIdMap:freshMap}.
For each supplied message sequentially allocate new messageId, overwrite map oldinfo.id
BEFORE clone/write; await runtime.persistMessage(cloneMessageForFork(...),trace,
{sessionID:oldinfo.sessionID,id:oldinfo.id}); for each part await persistPart(clonePart,
trace,{sessionID:oldpart.sessionID,id:oldpart.id}); increment copied count only after all
parts. Returned Map identity is the same passed to clone helpers; partial writes and
original rejection propagate. No preallocation of future message ids; duplicate keys
allocate again and overwrite, ordered processing retained.

list: await eventStore.getEvents then await runtime.loadCheckpointMessagePreviews even
if no checkpoints. Select event.type CheckpointCreated; parse EVERY matching payload
before scope filtering (parser errors beyond limit still propagate). Keep Workspace or
Both, projection ordered checkpointId,compactBoundaryId,coveredByCompact,createdAt:
original event.timestamp ref,diffRef,fileCount,messageId,targetMessageId,toolMessageId,
preview:Map.get(targetMessageId??messageId),scope,snapshotRef. Reverse resulting order.
Limit applied only if options.limit truthy AND >0, by native slice(0,limit); no new cap.

load previews: no store -> freshMap, otherwise await live store.messages({sessionID}).
Build id index with last duplicate winning. Visit messages in original order: assistant
uses parentID lookup in that index, other role uses itself. Derive preview with dependency
only if source exists; truthy result written under message.info.id (duplicates overwrite,
map retains first insertion order). Original message objects passed to helper.

## Checkpoint-target fork

Trace priority options.traceContext??getCurrentTraceContext()??rootTraceContext.
If truthy targetMessageId and NO truthy targetCheckpointId, return-await unchanged
forkWorkspaceAtMessage.call(this,{abortSignal,forkedSessionId,targetMessageId,traceContext}).
Otherwise await events, selectCheckpointForRewind(events,targetCheckpointId). Missing ->
createCoreError(InvalidStateTransition, targetCheckpointId?`Checkpoint not found: ${id}`:
'No workspace checkpoint is available yet.',{context:{targetCheckpointId,targetMessageId},
recoverable:true}). This happens BEFORE adapter guards. If missing any session/artifact/
file port -> ConfigurationError 'Fork requires session, artifact, and file-system adapters.',
context booleans ordered hasArtifactStore,hasFileSystemPort,hasSessionStore,recoverable:true.
Await live sessionStore.getSession(sessionId); absent SessionNotFound `Session not found:
${sessionId}`,context{sessionId},recoverable:true. Await artifactStore.readToolResultArtifact
({uri:checkpoint.snapshotRef,trace},{signal:options.abortSignal}), JSON.parse then parser.
NO extra early abort check; port owns its signal. Await live store.messages({sessionID}).
Active source uses unchanged forkSourceMessagesForSession. targetResolved=checkpoint.
targetMessageId??messageId, first matching ID. Missing -> InvalidStateTransition
`Checkpoint message not found in session store: ${id}`,context{checkpointId,messageId},
recoverable:true, BEFORE child creation.

Await createForkedSession; compute history end with expandAssistantTurn:false; build
history; await runtime.copySessionMessagesForFork({forkedSessionId,messages:history,traceContext}).
Await copyGoalStateForFork.call(runtime,{forkedSessionId,messageIdMap,traceContext}); await
runtime.restoreWorkspaceCheckpointArtifact(artifact,trace,signal). Existing dependencies
own actual writes/security, no bypass/fallback. copiedTarget=messageMap.get(targetResolved);
capture Date.now after restore. Await runtime.persistAssistantTimelinePartForSession with
ordered sessionId,messageID:newFactory,partID:createPartId(`fork_${String(sessionId)}_${String(targetResolved)}_${checkpointId}_timeline`),
parentID:copiedTarget,created,completed:created,finish:completed,timeline ordered timelineType:
session_fork,display:separator,status:completed,anchorMessageId:copiedTarget,parentSessionId,
targetMessageId,targetCheckpointId,restoredFileCount,time:{start:created,end:created},traceContext.
Await runtime.persistSyntheticUserNoticeForSession({messageID:newFactory,sessionId:child,
source:fork,text:formatWorkspaceForkNoticeBody(...),metadata:{forkContext:{kind:session_fork,
parentSessionId,targetMessageId,targetCheckpointId,restoredFileCount}},traceContext}).
Create SessionForked payload originalSessionId,forkedSessionId,forkPoint:historyEnd,
targetMessageId,targetCheckpointId,restoredSnapshotRef,restoredFileCount,strategy:ForkRequired;
await runtime.appendEvent(event,trace), no catch. Return ordered checkpoint,copiedMessageCount,
forkedSessionId,parentSessionId,targetMessageId,targetCheckpointId,restoredFiles,response:
`Forked session ${child} from checkpoint ${checkpointId}: copied ${count} messages and restored ${files} file${files===1?'':'s'}.`
Partial effects survive later failure, no compensation added. Keep array/Map/event references.
