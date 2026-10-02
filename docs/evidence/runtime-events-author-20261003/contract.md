# Session event lifecycle — body-free functional/API packet

Read only this contract/api.d.ts. Reconstruct complete events.ts owner in coherent
<400-line files, events-* private helpers allowed. No predecessor body/history/tests/
oracles/other packets/production, live IO/providers, builds or settings. Save/hash ALL
draft files before comparison. Curator source-exposed; this contract is source-derived.
Standard protocol projection is allowed; no invented framework or algorithm for novelty.

Unchanged dependencies: ../deps.js public contracts, factories createMessageId/createPartId/
createSessionEvent, traceContextToLogContext, SessionEventType, constants SESSION_ENTRY_
TARGET_COMPLETION_VERIFICATION/USER_INPUT_AUTO_RESOLUTION; WorkspaceId @knorvia/contracts;
../internal.js AgentRuntimeInternal; ../helpers/index.js titleFromInput/slugify/projectIdFromDirectory;
../execution-state.js buildExecutionStateEntry(sessionId,readRuntimeExecutionState(runtime))
(no permission implementation changes); ./input-intent-persistence.js
buildPersistedConversationInputIntent(text,intent,queued); ./usage-observability.js
recordToolUsageFromEvent(runtime,event,trace); ./session-shell-environment.js
persistSessionShellEnvironmentSnapshot(runtime,trace); ./turn-model.js
persistRuntimeModelSelection(runtime,selection); ./workspace-checkpoint-persistence.js
persistWorkspaceCheckpointEntry and persistWorkspaceFileRewindEntry(runtime,event,trace).
Those modules remain their current owners. Every existing async helper no-op still
settles through a native Promise. Do not add/remove awaited orchestration boundaries.

## Create and publish

createEvent is sync createSessionEvent(type,this.sessionId,payload,{turnId:trace.turnId,
traceId:trace.traceId}), no extra metadata or cloning. isSessionPersisted returns flag.
appendEvent: decide lifecycle log by input event.type in SessionTitleUpdated,TurnStarted,
ModelRequest,ModelComplete,TurnComplete,TurnError. Capture startedAt=Date.now even if not
logged. Lifecycle info start happens OUTSIDE catch, label Session event persistence started,
fields traceLog,event:session.event.persistence.started,module:core.runtime,sessionEventType:
inputevent.type,status:started. phase initially event_store.append. Inside catch boundary:
await live eventStore.append(inputevent) -> storedEvent; then phase session_event.persist_durable,
await native async durable dispatcher; phase session_event.record_usage, await unchanged
recordToolUsageFromEvent; phase session_event.notify_sinks, await runtime.notifyEventSinks
(storedEvent,trace). Consumers get storedEvent identity/sequence, never input event copy.
Lifecycle complete info fields traceLog,durationMs:Date.now-startedAt,event:
session.event.persistence.completed,module:core.runtime,sessionEventSequenceNumber:
storedEvent.sequenceNumber,sessionEventType:storedEvent.type,status:completed.
Then synchronous summary admission; if admitted return; else flush all existing summaries
reason low_frequency_event then debug Session event appended {traceLog,event:event_store.appended,
module:core.runtime,sessionEventSequenceNumber,sessionEventType}. Catch: lifecycle only
warn Session event persistence failed {traceLog,durationMs,event:session.event.persistence.failed,
errorMessage:error instanceof Error?message:String(error),module:core.runtime,phase,
sessionEventType:INPUTevent.type,status:failed}; rethrow original error. No added abort,
retry/cache, or serialization. Concurrency and reentrancy follow existing ports/awaits.

## Summary owner

One module WeakMap keyed runtime -> insertion-ordered Map. Summarized types ModelStreaming,
ModelNetworkStatus,StreamingToolLedgerUpdated,ToolCallProgress. Key `${trace.turnId??'session'}:${event.type}`.
Payload kind: truthy object nonarray, kind is nonempty string ->kind else '<missing>'.
Byte measure Buffer.byteLength(JSON.stringify(payload)??'null','utf8'); serialization throw ->0.
Admission only summarized types. Existing entry updates in order eventCount++,lastEventId:
String(id),lastSessionEventSequenceNumber,payloadBytes+=measuredbytes,payloadKinds[kind]=
(previous??0)+1. At >=100 flush key. Fresh entry ordered eventCount:1,eventType,firstEventId:
String(id),firstSessionEventSequenceNumber,lastEventId:String(id),lastSessionEventSequenceNumber,
payloadBytes,payloadKinds:{[kind]:1}; admission true. Flush deletes key BEFORE logger callback,
label Session event append summary with traceLog,event:event_store.appended.summary,eventCount,
firstEventId,firstSessionEventSequenceNumber,flushReason,lastEventId,lastSessionEventSequenceNumber,
module:core.runtime,payloadBytes,payloadKinds:SAMErecordref,sessionEventType. Bulk flush iterates
live Map order; missing/empty no-op. Preserve logger throws/reentrancy and unchanged threshold.

## Durable facts native async dispatcher

Missing sessionStore: return native async no-op. Exact dispatch precedence/types below;
no coalescing/extra async envelope per case. CheckpointCreated await unchanged checkpoint
entry owner, return. RewindTriggered await unchanged file-rewind entry owner, return.
UserInputAutoResolutionUpdated: payload typedcontract; try await optional live store.
saveSessionEntry({id:`user-input-auto-resolution:${interactionId}`,sessionID:event.sessionId,
type:USER_INPUT_AUTO_RESOLUTION,time:{created:payload.autoResolution.startedAt,updated:
event.timestamp.getTime()},data:{interactionId,toolCallId,autoResolution:originalref,eventId:
event.id,sequenceNumber,traceId,conditionaltruthy turnId}}); catch warn Failed to persist user
input auto-resolution state {traceLog,errorMessage,event:user_input_auto_resolution.persist_failed,
interactionId,module:core.runtime,status:failed}; return. Payload projection is inside try.

TurnSteerQueued payload pendingInputId,input,commandKind?,delivery?,intent?. Derive
conversationInputIntent BEFORE try, phase queued. Try await optional saveSessionInput
({id:pendingInputId,sessionID:event.sessionId,kind:intent.kind??commandKind??sendText,
delivery:delivery??queue,payload:{text:input,conditionaltruthy intent originalref,
conditionaltruthy conversationInputIntent}}); catch warn Failed to admit session input
to ledger {traceLog,errorMessage,event:session_input.admit_failed,module:core.runtime,
pendingInputId,status:failed}; return.
TurnSteerDeliveryChanged payload admittedDelivery:queue,intent?,pendingInputId. Try await
optional updateSessionInputs({sessionID:event.sessionId,updates:[{delivery:admittedDelivery,
id:pendingInputId,conditionaltruthy intent}]}); catch warn Failed to persist session input
delivery fallback {traceLog,errorMessage,event:session_input.delivery_change_failed,module:
core.runtime,pendingInputId,status:failed}; return.
TurnSteerDiscarded: payload pendingInputIds,reason?. Reason promoted -> native no-op,
NEVER settle ledger. session_resumed status discarded, all other reasons cancelled.
Each ID sequentially try await optional settleSessionInput({id,sessionID:event.sessionId,
status,reason}); catch per ID warn Failed to settle session input in ledger {traceLog,
errorMessage,event:session_input.settle_failed,module:core.runtime,pendingInputId,status:failed},
CONTINUE following IDs. Return. Unmatched event types native no-op.

TargetCompletionVerification: entire operation inside try. timestamp=event.timestamp.getTime;
payload fields targetId,verificationId,goalIteration?,anchorAssistantMessageId?,anchorTurnId?,
status,verification?. key=goalIteration!==undefined?`${targetId}_${goalIteration}`:verificationId.
partID=createPartId(`goal_verify_${key}_timeline`). Await native readTiming helper: await
optional live store.messages({sessionID}); first message whose parts.find id matches and
is timeline gives {messageCreated:info.time.created,partStarted:part.time?.start}; otherwise
undefined. created=previous?.messageCreated??timestamp; start=previous?.partStarted??timestamp.
If store.saveSessionEntry truthy await entry {id:String(event.id),sessionID:event.sessionId,
type:TARGET_COMPLETION_VERIFICATION,time:{created:timestamp,updated:timestamp},data:{eventId,
payload:EVENTpayloadref,sequenceNumber,traceId,conditionaltruthy turnId}}. Await runtime
persistAssistantTimelinePartForSession({sessionId:event.sessionId,messageID:createMessageId
(`goal_verify_${key}`),partID,parentID:payload.anchorAssistantMessageId,created,
completed:status===started?undefined:timestamp,finish:status,timeline:{timelineType:
goal_verification,display:separator,status,anchorMessageId,anchorTurnId,targetId,verificationId,
goalIteration,verification:originalref,time:{start,end:status===started?undefined:timestamp}},traceContext}).
Catch warn Failed to persist target completion verification event {traceLog,errorMessage,
event:session_entry.target_completion_verification.persist_failed,module:core.runtime,
sessionEventType:event.type,status:failed}; swallowed original unless logger throws.

notifyEventSinks: live for-of this.eventSinks; each await sink.onSessionEvent(event) with
sink receiver; catch per sink warn Session event sink failed {traceLog,errorMessage,event:
session_event_sink.failed,module:core.runtime,sessionEventType:event.type,status:failed},
then next sink. No snapshot/retry; callback mutation and failures have existing effects.

## Session initialization

Native async ensureSessionPersisted returns if !live store OR flag true (guard priority).
No in-flight lock; concurrent calls may each create until flag flips. Date.now startedAt;
phase session_store.create; info start OUTSIDE try label Session persistence started,
fields traceLog,event:session.persistence.started,module:core.runtime,sessionId,status:started.
Inside try directory=workingDirectory; persistedPath=config.workspacePath??directory;
title=titleFromInput(input); workspaceIdentity=config.memory?.workspaceIdentity?.trim().
Await live store.createSession ordered {id:sessionId,projectID:projectIdFromDirectory(directory),
workspaceID:config.workspaceIdentity??(workspaceIdentity branded WorkspaceId without IDgenerator),
parentID:config.parentSessionId,traceID:trace.traceId,taskType:config.taskType,slug:slugify(sessionId),
directory:persistedPath,path:persistedPath,title,titleSource:first_input,version:appVersion,
permission:{mode:config.mode??build}}. Do not redesign permissions.
phase session_model_selection; selection=getSessionModelSelection(); truthy selection
await unchanged persistRuntimeModelSelection. phase session_shell_snapshot; await unchanged
persistSessionShellEnvironmentSnapshot. phase session_execution_state; await optional live
store.saveSessionEntry(buildExecutionStateEntry(sessionId,readRuntimeExecutionState(this))).
Flip sessionPersisted=true BEFORE debug Session persisted {traceLog,event:session.persisted,
module:core.runtime,status:completed}. phase session_title_event; create SessionTitleUpdated
{previousTitle:'',source:first_input,title},trace; await appendEvent(event,trace). Info
Session persistence completed {traceLog,durationMs:Date.now-startedAt,event:session.persistence.completed,
module:core.runtime,sessionId,status:completed}. On any caught failure warn Session persistence
failed {traceLog,durationMs,errorMessage,event:session.persistence.failed,module:core.runtime,
phase,sessionId,status:failed}, rethrow SAME error; flag/previous writes retained, no rollback.
