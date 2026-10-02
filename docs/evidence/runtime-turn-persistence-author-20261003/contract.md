# Runtime persisted facts — functional/API-only author packet

Author five modules in api.json. Read only this packet/API; no source/history/tests/
oracles or other packets. Save/hash outputs before review. Dependency APIs below are
facts; runtime, session/event stores and helpers unchanged. No services/tests/agents.
Private representation free; preserve synchronous/no-op and native async boundaries,
live field reads and ordered fields/operations below. Strings are retained formats.

## timeline-persistence

Imports createModelId/createModelProviderId from @knorvia/contracts; createMessageId/
createPartId and types from ../deps.js, emptyTokenUsageInfo from ../helpers/index.js,
AgentRuntimeInternal type ../internal.js.
recordPendingModelChange: read current pendingModelChangeTimeline; original fromModel
and label nullishly retained from existing then input. If fromModel exists and providerId,
modelId,options?.reasoningLevel equal to input.toModel (short-circuit order), clear
pending and return. Else assign new ordered {createdAt:existing?.createdAt??Date.now(),
fromModel,fromModelLabel,requestId:existing?.requestId??String(createPartId()),toModel:
input.toModel,toModelLabel:input.toModelLabel}. Model refs stay shared; no other equality.

persistPendingModelChangeTimeline: capture pending; absent native async no-op. Clear
pending BEFORE timestamp/write and never restore on error. created=Date.now(). Await
this.persistAssistantTimelinePartForSession ordered input sessionId=this.sessionId,
messageID=createMessageId(`${pending.requestId}_message`),partID=createPartId(`${pending.requestId}_timeline`),
parentID=this.latestConversationMessageId,created,completed:created,finish:'completed',
timeline,traceContext. Timeline ordered timelineType:'model_change',display:'separator',
status:'completed',anchorMessageId=this.latestConversationMessageId,fromModel conditional
object if pending.fromModel else undefined,toModel,time:{start:created,end:created}.
From model fields ordered providerId,modelId,conditional truthy options sharedref,
label=pending.fromModelLabel??`${providerId}/${modelId}`. To fields same except label
pending.toModelLabel. Preserve separate repeated runtime/latest/model reads.

persistAssistantTimelinePartForSession: absent this.sessionStore returns ordered
{messageID:options.messageID??createMessageId(),partID:options.partID??createPartId()},
no other reads/effects. Else choose those two IDs, created=options.created??options.timeline.time?.start??Date.now(),
selection=this.getSessionModelSelection(). Await this.persistMessage(message,traceContext)
BEFORE this.persistPart(part,traceContext). Message ordered id,sessionID,role:'assistant',
time:{created,completed:options.completed??options.timeline.time?.end},parentID:
options.parentID??this.latestConversationMessageId??messageID,modelId:selection&&createModelId(selection.modelId),
providerId:selection&&createModelProviderId(selection.providerId),mode:this.config.mode??'build',
planEnabled:this.getPlanEnabled(),agent:this.config.agentName??'agent',path:{cwd:this.workingDirectory,root:this.workspaceRoot},
cost:0,tokens:emptyTokenUsageInfo(),finish:options.finish??options.timeline.status,
semantics:{origin:'system',kind:'timeline_event',uiVisibility:'visible',providerVisibility:'hidden',transcriptVisibility:'visible'}.
Part {...options.timeline,id:partID,sessionID:options.sessionId,messageID,type:'timeline'}.
Return ordered IDs. Exceptions propagate; no extra await/helper layer.

## tool-part-persistence

projectToolNameForNonEmptyBoundary(toolName): trim length>0 -> {toolName} original
untrimmed. Else {metadata:{providerToolName:toolName},toolName:'empty_tool_name'}.
persistPendingToolPart(runtime,options): if typeof toolCall.name string AND trimmed
length0, project actual name; otherwise requireRuntimeToolCallName(toolCall,{logger:
runtime.logger,model:options.model,source:'persistPendingToolPart',traceContext}) helper
from ../helpers/index.js. Preserve repeated name reads. Await runtime.persistPart
ordered id:partID,sessionID:runtime.sessionId,messageID:assistantMessageId,type:'tool',
callID:toolCall.id,declarationIndex,tool:projected.toolName,metadata:{...projected.metadata,
...options.metadata},state:{status:'pending',input:options.input,raw:JSON.stringify({tool:
projected.toolName,input:options.toolCall.input})}, then traceContext. Input refs differ
intentionally: state input supplied parsed input; raw toolCall input. Metadata overrides
provider key. JSON serialization/error precedes write. No catch/cancel policy.

## input-intent-persistence

buildPersistedConversationInputIntent: undefined intent -> undefined. Compute steer FIRST:
truthy fallbackReasonCode->{state:'fellBack',reasonCode}; else admittedDelivery==='guide'
->{state:dispatchState==='drained'?'guided':'steering'}; else{state:'notRequested'}.
Return ordered sourceCommandId,queueItemId,clientId,kind,text:intent.text??suppliedText,
attachments:intent.attachmentRefs??fresh[],conditional truthy modelSelection,conditional
truthy mode,conditional planEnabled!==undefined (includingfalse),conditional truthy
sharedContextRefs,delivery:{requested:requestedDelivery,admitted:admittedDelivery,
conditional truthy fallbackReasonCode},order:{admissionSeq,conditional queuePosition!==undefined},
steer,dispatch:{state:dispatchState},admittedAt,conditional truthy provenance. All
conditional values retain supplied refs; don't recompute admission. Optional fields
with undefined are omitted only where explicitly conditional. Types ../deps.js.
Original discretionary prose excluded; concise original facts allowed.

## cancelled-stream-persistence

Native async function, capture completedAt=Date.now() once before reasoning reads.
For each snapshot.reasoning in order use hasAssistantReasoningContent helper from
./turn-output-token-continuation.js. Skip absent content; await runtime.persistPart
ordered id:createPartId(),sessionID:runtime.sessionId,messageID:assistantMessageId,
type:'reasoning',text:reasoning.text,metadata:reasoning.providerOptions sharedref,
time:{start:assistantCreatedAt,end:completedAt}, traceContext. After ALL reasoning,
if !snapshot.text native async return; else await text part same fields except no
metadata, type:'text',text:snapshot.text. Never flush tools. No abort guard, catch,
retry, extra flush or new signal. Mid-write error stops later writes; errors same refs.

## workspace-checkpoint-persistence

Exports four API functions; imports event helpers/constants/types from ../deps.js.
Persist checkpoint: if !runtime.sessionStore?.saveSessionEntry return BEFORE try.
Inside try timestamp=event.timestamp.getTime(); await live runtime.sessionStore.saveSessionEntry
ordered id:`workspace-checkpoint:${String(event.id)}`,sessionID:event.sessionId,type:
SESSION_ENTRY_WORKSPACE_CHECKPOINT,time:{created:timestamp,updated:timestamp},data:
{eventId:String(event.id),payload:parseCheckpointCreatedPayload(event.payload),sequenceNumber:
event.sequenceNumber,traceId:String(event.traceId),conditional truthy turnId:String(event.turnId)}.
Any inside error -> optional logger.warn('Failed to persist workspace checkpoint',
{...traceContextToLogContext(traceContext),errorMessage:Error.message else String(error),
event:'checkpoint.persist.failed',module:'core.runtime',status:'failed'}). Logger errors
propagate. Return after catch, no retry. No abort options introduced.

File-rewind persist same guard, then parseRewindTriggeredPayload OUTSIDE try. If scope
!==RewindScope.Workspace OR reason!=='file_summary_rewind' return. Try timestamp/write
same entry/data shapes except id:`workspace-file-rewind:${payload.rewindId}`,type:
SESSION_ENTRY_WORKSPACE_FILE_REWIND,data.payload exact parsedref. Catch warning label
'Failed to persist workspace file rewind',event:'workspace_file_rewind.persist.failed'.

Restore checkpoint/file-rewind: guard !runtime.sessionStore?.sessionEntries -> native
async return. Try await sessionEntries({sessionID:runtime.sessionId,type:appropriateconstant});
catch warn respectively 'Failed to read persisted workspace checkpoints' / 'Failed to
read persisted workspace file rewinds', event checkpoint.restore.read_failed /
workspace_file_rewind.restore.read_failed, then return. Remaining steps OUTSIDE catch.
Await eventStore.getEvents(runtime.sessionId); existing IDs collected in event order:
only matching SessionEventType.CheckpointCreated / RewindTriggered; try parse payload
and get checkpointId / rewindId; invalid payload silently skip. File-rewind existing
IDs include all rewind-triggered scopes/reasons. No broadcast during restore.
Copy entries array and stable sort by (validated data.sequenceNumber??0) ascending,
then entry.time.created ascending. Validate record: truthy object, nonarray; eventId
string,sequenceNumber number (NaN allowed by validator),traceId string,'payload' in
record,turnId undefined OR string. Return original dataref or null; do not sanitize.

For each sorted entry validate data; invalid skip before try. Inside try parse payload;
checkpoint duplicate skip; file-rewind also require Workspace/file_summary_rewind then
check rewindID. Build createSessionEvent(type,runtime.sessionId,payload,{traceId:data.traceId,
conditional truthy turnId:data.turnId}); overwrite event.timestamp=new Date(entry.time.created),
sequenceNumber=data.sequenceNumber. Await runtime.eventStore.append(event), then add ID
only after success. eventId is validation fact, NOT reused as restored event.id. On
per-entry failure warn 'Skipped invalid persisted workspace checkpoint' / 'Skipped
invalid persisted workspace file rewind', ordered {...traceContextToLogContext,entryId:
entry.id,errorMessage,event:'checkpoint.restore.invalid_entry' /
'workspace_file_rewind.restore.invalid_entry',module:'core.runtime',status:'failed'}.
Continue after warning. Existing events/sort/read errors remain outside per-entrycatch.
No new ownership/cache, native await gates unchanged. Public facts/types in api.json.
