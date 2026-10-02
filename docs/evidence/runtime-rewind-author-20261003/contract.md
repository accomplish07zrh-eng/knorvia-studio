# Runtime rewind owner — functional/API-only packet

Author rewind.ts and rewind-message.ts with cohesive internal helpers as needed to
keep each file<=400lines. Public exports exactly api.json. Read only this/API, not
source/history/tests/oracles/other packets. Save/hash all files before comparison.
No new policy/retry/transaction/cache, no permission modules. Existing helper deps
unchanged. Native function awaits/no-op paths preserve settlement count; moving a
private function to another module adds no extra wrapper/await. Trace/session/FS/history
owners unchanged. All strings/formats below fixed; concise original comments allowed.
Imports enums/functions/types ../deps.js; runtime helpers ../helpers/index.js; internal
runtime type ../internal.js; result types ../types.js. Internal helper modules same layer.

## rewind.ts public command lifetime

executeRewindCommand(this,input,command,turnId,traceContext,signal,inputId): create
fresh events[],startedAt=Date.now(),activeTurn=this.beginActiveTurn(turnId,traceContext,
'rewind',false) synchronously. Return runWithContextAsync(traceContext,async callback)
.finally(()=>this.finishActiveTurn(activeTurn)). Callback logs info 'Rewind command started'
ordered {...traceContextToLogContext,event:'rewind.started',inputLength:input.length,
module:'core.runtime',status:'started'}. Await ensureSessionPersisted(input,traceContext)
then createEvent(TurnStarted,{turnNumber:this.turnNumber,input,inputId},traceContext),
await appendEvent,events.push. These gates OUTSIDE recoverable try; finally still runs.

Inside try throwIfTurnAborted(signal); dispatch exact priority: action status->await
formatRewindStatus(); fork->await forkWorkspaceFromCheckpoint({abortSignal:signal,
targetCheckpointId:command.targetCheckpointId,traceContext}).response; message->await
rewindToMessage({abortSignal:signal,events,scope:command.scope,targetMessageId:command.targetMessageId,
traceContext}).response; cascade-message same through rewindCascadeToMessage; all other
actions rewindWorkspaceToCheckpoint({abortSignal:signal,events,targetCheckpointId,traceContext}).response.
Then throwIfTurnAborted again. usage=createModelUsageSummaryFromEvents(events); create
TurnComplete payload ordered response,tokenCount:0,usage,toolCallCount:0,duration:
Date.now()-startedAt,resultType:'success',cacheStats:this.messageHistory.getCacheStats(),
inputId. Await append, push, await recordTurnUsageFact(this,{completedAt:Date.now(),
events,startedAt,status:'completed',traceContext,turnId}) from ./usage-observability.js.
Increment turnNumber, await rebuildProjection, info log 'Rewind command completed'
{...traceLog,durationMs:Date.now()-startedAt,event:'rewind.completed',module:'core.runtime',
status:'completed'}. Return {response,turnId,traceId:traceContext.traceId,usage,events,projection}.
Catch createTurnFailureError(error,signal,'Rewind failed'); await appendTurnOutcomeEvent
(this,{coreError,events,durationMs:Date.now()-startedAt,turnPhase:'rewind',inputId,traceContext,
fallbackMessage:'Rewind failed',logEvent:'rewind.failed',logLabel:'Rewind'}); await record
usage {completedAt:Date.now(),error:coreError,events,startedAt,status:coreError.type===
CoreErrorType.TurnCancelled?'cancelled':'error',traceContext,turnId}; throw coreError.
No extra errorcatch around finally/usage/outcome publication.

formatRewindStatus: await rebuildProjection; no lastCheckpoint -> 'No workspace checkpoint
is available yet.'. fileCount undefined -> 'unknown files',else `${n} file${n===1?'':'s'}`;
truthy coveredByCompact adds `, covered by compact ${compactBoundaryId??'boundary'}`.
Return `Latest checkpoint: ${checkpointId} (${fileText}${compactText}). Run /rewind latest to restore workspace files from it.`

rewindWorkspaceToCheckpoint: allocate `rewind_${crypto.randomUUID()}`; await eventStore.getEvents(sessionId),
selectCheckpointForRewind(events,targetCheckpointId). Missing->finishUnavailableRewind
{events,reason:truthy target?'target_checkpoint_not_found':'no_checkpoint_available',rewindId,
targetCheckpointId,traceContext}. Missing artifact/file port->same {checkpoint,events,
reason:!artifactStore?'artifact_store_not_configured':'file_system_port_not_configured',
rewindId,targetCheckpointId:checkpoint.checkpointId,traceContext}. Evaluation
 evaluateRewindTarget({checkpointAvailable:true,items:buildRewindEvaluationItems(events),
scope:Workspace,targetMessageId:checkpoint.targetMessageId??checkpoint.messageId}).
Only ActiveChain/FileOnly admitted, otherwise unavailable {checkpoint,evaluation,events,
reason:evaluation.reason,rewindId,targetCheckpointId:checkpoint.checkpointId,traceContext}.
Try throwIfTurnAborted; await artifactStore.readToolResultArtifact({uri:checkpoint.snapshotRef,
trace:traceContext},{signal}); JSON.parse content then parseWorkspaceCheckpointArtifact.
Catch cancellation -> throw createTurnCancelledError(error); else warn 'Workspace rewind
checkpoint read failed' {traceLog,errorMessage,event:'rewind.snapshot.read.failed',module:
'core.runtime',snapshotRef,status:'failed'}, finishUnavailable reason checkpoint_snapshot_unavailable
with checkpoint/evaluation/events/ID/trace. Restore is OUTSIDE catch: await restoreWorkspaceCheckpointArtifact
(artifact,trace,signal); createdMessageId=createMessageId(); notice=formatWorkspaceRewindNoticeBody
{checkpoint,evaluation,restoredFiles,rewindId}; await persistSyntheticUserNotice(ID,notice,trace),
messageHistory.addAttachment('rewind_notice',notice). Create RewindTriggered payload ordered
rewindId,scope:Workspace,strategy:evaluation.strategy,targetMessageId:checkpoint.targetMessageId??
checkpoint.messageId,targetCheckpointId:checkpoint.checkpointId,compactBoundaryId:
evaluation.compactBoundaryId,restoredSnapshotRef:checkpoint.snapshotRef,createdMessageId,
reason:evaluation.reason. Await append/push. Return {checkpoint,evaluation,restoredFiles,
response:`Rewound workspace to checkpoint ${checkpoint.checkpointId}: restored ${n} file${n===1?'':'s'}.${suffix}`,
rewindId,strategy:evaluation.strategy}. suffix FileOnly->' Workspace files were restored; conversation history stayed at the compacted context.',else''.

finishUnavailableRewind: create RewindTriggered {rewindId,scope:options.scope??Workspace,
strategy:options.evaluation?.strategy??Unavailable,targetMessageId:options.targetMessageId??
options.checkpoint?.targetMessageId??options.checkpoint?.messageId,targetCheckpointId,
compactBoundaryId:options.evaluation?.compactBoundaryId,restoredSnapshotRef:undefined,reason}.
Await append/push. Return {checkpoint,evaluation,restoredFiles:fresh[],response:
formatUnavailableRewindResponse(reason,targetCheckpointId,targetMessageId),rewindId,
strategy:evaluation?.strategy??Unavailable}. No extra validation/abort.

## rewind-message.ts admission and workspace cascade

Public rewindToMessage: Workspace -> return this.rewindWorkspaceToMessage(options);
Both -> await workspace; if strategy!==ActiveChain return workspace; then await
conversation and return {...conversation,response:`${workspace.response}\n${conversation.response}`};
else return this.rewindConversationToMessage(options). Native async returns, no addedawait.

rewindCascadeToMessage: Workspace->return private workspace cascade; Both->await strict
conversation plan(targetMessageId only, no assistant remap); unavailable->return unavailable
conversation result below (no event). Else await workspace cascade; only ActiveChain
continues to await apply conversation plan then merged response as above. Other scope
returns this.rewindConversationToMessage(options). Conversation plan BEFORE any workspace effect.

rewindWorkspaceToMessage: await events, selectCheckpointForMessage(events,targetMessageId);
missing->this.finishUnavailableRewind({events,reason:'target_checkpoint_not_found',rewindId:
random,scope:options.scope,targetMessageId,traceContext}); else return this.rewindWorkspaceToCheckpoint
{abortSignal,events,targetCheckpointId:checkpoint.checkpointId,traceContext}.

Private workspace cascade: await events, then active messages: no sessionStore->[];
otherwise await getSession(sessionId),await messages({sessionID}); activeSessionMessages
(messages,{branchCutAfterMessageId:session?.revert?.branchCutAfterMessageID,rewindCreatedMessageId:
...createdMessageID,rewindKeptMessageIds:...keptMessageIDs,rewindTargetMessageId:...targetMessageID}).
suffix IDs=activeSuffixMessageIdsForRewind(activeMessages,target); selected checkpoints
=selectCheckpointsForMessages(events,suffix.length>0?suffix:[target]); none->unavailable
as workspace primitive; one->return checkpoint primitive; many->multi-checkpoint restoration.

Multi-checkpoint: baseline=first,latest=last,randomrewindID. Missing artifact/file port
->unavailable latest checkpoint and targetMessageId. Evaluate Workspace from
buildMessageRewindEvaluationItems(await active messages) and target. Non ActiveChain/
FileOnly->unavailable latest plus evaluation. Copy checkpoints reversed. For each:
throwIfTurnAborted OUTSIDE try; try await private native async artifact reader (read port
then JSON parse/schema), collect checkpoint+artifact; catch cancellation converted;
otherwise warning 'Workspace cascade rewind checkpoint read failed' {traceLog,checkpointId,
errorMessage,event:'rewind.cascade.snapshot.read.failed',module:'core.runtime',snapshotRef,
status:'failed'}, return unavailable currentcheckpoint with reason checkpoint_snapshot_unavailable,
NO evaluation field in this failure. Read ALL artifacts before file effects. Then each
artifact reverse-order throwIfTurnAborted; await restoreWorkspaceCheckpointArtifact;
append all returned restored refs in order. Notice format(baseline,evaluation,restored,ID)
plus `\nrestoredCheckpoints: ${options.checkpoints.length}`; persist notice/add attachment;
RewindTriggered same primitive shape except targetMessageId suppliedtarget and baselinecheckpoint.
Return {checkpoint:baseline,evaluation,restoredFiles,response:`Rewound workspace through ${count} checkpoint${count===1?'':'s'} to checkpoint ${baseline.checkpointId}: restored ${n} file${n===1?'':'s'}.${FileOnlySuffix}`,rewindId,strategy}.

## Conversation branch planning / commit

rewindConversationToMessage: await plan({targetMessageId,remapAssistantAnchor:scope===undefined
OR scope===Conversation}); unavailable->return no-event result; else return apply
{abortSignal,events,plan,targetMessageId:ORIGINAL requested target,traceContext}.
Plan native async: allocate randomID before guard. No store->{kind:'unavailable',reason:
'conversation_rewind_requires_session_store',rewindId}. Await getSession then messages.
selectActiveConversationBranch(messages,same four revert fields above), no compact filtering.
FIRST requested index by ID. If remap true and requested index>=0 but not user&&!summary,
scan earlier backward for nearest user&&!summary (not anchor/turn-ID heuristic); if
none target index=-1. effective ID actual target found else original ID. Evaluate
Conversation with buildMessageRewindEvaluationItems(active). Non ActiveChain OR target<0
-> {evaluation,kind:'unavailable',reason:target<0?(requested<0?'target_message_not_found':
 'target_message_is_not_user_prompt'):evaluation.reason,rewindId}. Then enforce actual
target user&&!summary even if evaluationadmitted; otherwise same unavailable reason.
Available record ordered evaluation,branchCutAfterMessageId:persisted.at(-1).info.id,
branchGeneration:(session?.revert?.branchGeneration??0)+1,keptMessages:active.slice(0,targetIndex),
kind:'available',persistedMessages,removedTurnIds:active.slice(targetIndex).flatMap truthy
info.anchor?.turnId ->String(turnId) else[],rewindId. No dedup at this stage.

Apply native async: throwIfTurnAborted FIRST. Capture plan fields. Await cancel removed
branch tasks native async helper: Set removedIDs; empty->return; Object.values(registry.all())
filter same branchGeneration===runtime.branchGeneration AND turnId!==undefined AND
sethas(String(turnId)) AND status==='running'. Sequentially await stopBackgroundTask
(task.taskId,{traceContext}); !result.ok throws Error(`rewind background task cancellation failed: ${task.taskId}`).
No branch commit if stoppingfails. Then await sessionStore.setRevert({sessionID,
revert:{keptMessageIDs:kept.map(info.id),branchCutAfterMessageID,branchGeneration,messageID:
kept.at(-1)?.info.id??originaltarget,kind:'conversation_rewind',scope:Conversation,targetMessageID:originaltarget}}).
Set runtime.branchGeneration; optional registry.setActiveBranchGeneration?.(generation).
Await rebuild derived state below. RewindTriggered payload {rewindId,scope:Conversation,
strategy:evaluation.strategy,targetMessageId:originaltarget,compactBoundaryId,
branchCutAfterMessageId,branchGeneration,reason:evaluation.reason}; append/push. Info
'Conversation rewind applied' {traceLog,event:'rewind.conversation.completed',keptMessageCount,
branchGeneration,module:'core.runtime',status:'completed',targetMessageId}. Return
{evaluation,keptMessageCount,response:`Rewound conversation to before message ${originaltarget}.`,
rewindId,strategy,targetMessageId}. No synthetic conversation notice, no event onunavailable.
Unavailable result {evaluation,keptMessageCount:0,response:formatUnavailableRewindResponse
(reason,undefined,targetMessageId),rewindId,strategy:evaluation?.strategy??Unavailable,targetMessageId}.

Derived state native async: branch options ordered branchCutAfterMessageId,rewindKeptMessageIds,
rewindTargetMessageId. history.reset(); await hydrateMessageHistoryFromSession({artifactStore,
history:messageHistory,messages:persisted,...branch}); await hydrateReadFileStateFromSession
{messages:persisted,readFileState,workingDirectory,workspaceRoot,...branch}; rebuildContextPrefix
(runtime) from ./context-refresh.js; injectTargetStateIntoMessageHistory(await
readSessionTargetForContext(traceContext)). activeSessionMessages(persisted,branch) first;
then activeSessionMessages(persisted,{...branch,includeCompactPreservedSegment:false}).
Latest assistant last in latter; set latestConversationMessageId=getLatestActiveSessionMessageId
(latter); latestAssistantMessageId,latestAssistantTurnId; lastAssistantCompletedAtMs
if assistant exists AND 'completed' in info.time then value elseundefined. setCacheMiss();
mainTurnCacheHitAggregate=mainTurnCacheHitAggregateFromMessages({activeMessages,persistedMessages})
from ./turn-model-step-usage.js; turnNumber count active user&&!summary; currentTurnFileChanges
fresh Map; autoCompactConsecutiveFailures=0. No reordering effects, hidden catches or
new branch state. Exact runtime this receiver remains caller-owned throughout.
