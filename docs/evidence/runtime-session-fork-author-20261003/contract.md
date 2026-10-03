# Session fork lifecycle — functional/API-only packet

Implement complete public owner in api.json using cohesive internal session-fork-*
helpers (<400lines/file). Read only contract/API/dependency-api. No predecessor source,
history/tests/oracles/other packets. Save/hash ALL drafts before comparison. No live
ports/IO/tests/builds/agents. Runtime/store/clone helpers remain owners; preserve native
async awaits/return-await boundaries and fixed schemas/text/errors. Model/execution
state helpers are UNCHANGED dependencies, not permission code to reconstruct. Private
representation free; conventional maps/loops allowed, no framework/novelty requirement.

Imports: randomUUID node:crypto; resolveExecutionState/type ExecutionState @knorvia/shared;
buildExecutionStateEntry/readRuntimeExecutionState ../execution-state.js; createModelId,
createModelProviderId,type CreateSessionInput/ForkCommitBundle/ModelSelection @knorvia/contracts;
systemReminderRuntimeMetadata ../../agent/message-history.js; cloneModelSelection ../model-selection.js;
buildSyntheticUserNoticePartMetadata ./synthetic-notice-metadata.js; enum/factories/types
../deps.js; cloneMessageForFork/clonePartForFork/emptyTokenUsageInfo/formatConversationForkNoticeBody/
slugify ../helpers/index.js; runtime ../internal.js, fork/result types ../types.js.

## Errors and child input

Stable error = createCoreError(InvalidStateTransition,message,{context:supplied??fresh{},
recoverable:true}). Legacy missing store ConfigurationError 'Fork requires a session adapter.',
context{hasSessionStore:false},recoverable:true. Legacy absent parent SessionNotFound
`Session not found: ${sessionId}`,context{sessionId},recoverable:true. No error wrapping.
Child input captures now=Date.now(), ordered id,projectID:parent.projectID,workspaceID:
parent.workspaceID,parentID:runtime.sessionId,traceID:runtime.rootTraceContext.traceId,
taskType:kind('fork' default),slug:`${slugify(parent.slug)}-${kind}-${now.toString(36)}`
.slice(0,120),directory:parent.directory,path:parent.path,title:kind selection_side_chat?
'Selection side chat':`Fork of ${parent.title}`,titleSource:'generated',version:parent.version,
permission:parent.permission,time:{created:now,updated:now}. Refs parent.path/permission shared.

createForkedSession: guard legacy store. id=options.forkedSessionId??createSessionId();
construct input. If truthy stableForkMetadata require store.createForkedSessionWithMetadata
else stable error 'Stable fork requires atomic child metadata persistence', context
{forkedSessionId,sourceCommandId:metadata.sourceCommandId}; await that port(input,metadata),
return persisted.id WITHOUT execution entry. Else await store.createSession(input),
await optional store.saveSessionEntry?.(buildExecutionStateEntry(id,readRuntimeExecutionState(runtime))),
return requested ID (NOT createSession response ID). Call through live runtime store.

## Public transcript helpers

forkSourceMessagesForSession: selectActiveConversationBranch(parentMessages,{branchCutAfterMessageId:
parent.revert?.branchCutAfterMessageID,rewindCreatedMessageId:...createdMessageID,rewindKeptMessageIds:
...keptMessageIDs,rewindTargetMessageId:...targetMessageID}). No compact/provider clipping.
resolveForkHistoryEndIndex: target=messages[targetIndex]; if !expandAssistantTurn OR
not assistant return targetIndex+1. Else extend through immediately following assistant
messages with same info.parentID until first nonassistant/different parent; no turn-ID checks.
buildForkHistoryMessages: source.slice(0,end). If target assistant has truthy parentID
not already in slice AND slice contains active compaction boundary (part.type compaction
AND (Boolean(part.compactBoundary) OR !part.timelineStatus)), find FIRST parentMessages
info.id===parentID. If that record is realvisibleuser(roleuser,synthetic!==true,visibility
!=='model-only',!source,!summary,!active-compaction), prepend originalref; else leave slice.

History-before-input: first matching target ID; missing stableerror `Fork target input not found: ${id}`,
context{targetMessageId}; target role must user (synthetic allowed), else stableerror
'Fork-before-input target is not a user message',samecontext. Return prefix excludingtarget.
Stable history: target.orderedMessageIds nonempty and last===boundaryMessageId, else
'Stable fork target has an invalid boundary',{boundaryMessageId}. Duplicate IDs->
'Stable fork target contains duplicate message ids'. Build ID->LAST active index Map;
first requested ID missing->'Stable fork target is not an active transcript segment',
{messageId:firstID}. Each consecutive actual String(info.id) must equal requestedID;
else 'Stable fork target is not a contiguous active transcript segment',{messageId}.
Boundary roleassistant&&!error else 'Stable fork boundary is not a completed assistant message',
{boundaryMessageId}. No additional time.completed guard. Return active prefix plus
selectedsegment, originalrefs, no expansion beyond boundary.

## Atomic entrypoints

forkStableConversationAtMessage: sourceCommandId.trim nonempty else 'Stable fork sourceCommandId must not be empty'.
Require sessionStore?.commitForkBundle else 'Stable fork requires commitForkBundle'. Await
getSession(sessionId), missing stableerror sessionnotfound (no context); await messages;
active source; stable history. return await atomicOwner(runtime,{modelSelection,forkedSessionId,
goalBoundary,messages:history,parentSession,revisionAtDecision,sourceCommandId,target:
options.target,targetMessageId:target.boundaryMessageId,traceContext:options.traceContext??rootTraceContext}).

forkConversationBeforeMessage: require commit port else 'Fork requires a session adapter'
(no period). Same reads/parenterror; prefix before user. return await atomicOwner with
ordered commandFact,modelSelection,forkedSessionId,goalBoundary,initialInput,messages:prefix,
parentSession,sourceCommandId,targetMessageId,traceContext fallback. No sourceCommandIdtrim
or targetProductTurnId/targetTranscriptTurnId logic introduced.

createSelectionSideConversation: trimmed command guard 'Selection side chat sourceCommandId must not be empty';
commitguard 'Selection side chat requires commitForkBundle'; same reads/parenterror.
Active source; if no runtime.activeTurn?.turnId history fresh copy. Else FIRST user with
anchor.turnId===activeTurnId AND anchor.origin==='realUser': slice through that user;
otherwise FIRST any message with matchingturn: slice before it; absentturn allcopy.
Target last historyID??createMessageId(). return await atomicOwner {modelSelection,
goalBoundary:{kind:'none'},kind:'selection_side_chat',messages:history,parentSession,
revisionAtDecision,sourceCommandId,targetMessageId,traceContext fallback}. No child ID
option here, no goal/queue/current assistant increments copied.

## Atomic commit owner

Capture store; require commitForkBundle else stableerror. childID supplied??factory;
kind defaultfork; currentExecutionState=readRuntimeExecutionState(runtime); lastassistant
info in reverse COPY of options.messages. State for sidechat OR no assistant = current;
else resolveExecutionState(historicalInfo). Keep existing historical permission/Plan
choice; never edit those helpers. Sidechat sourceMessages maps only anchors with truthy
goalBoundary: shallowclone message/info/anchor then delete goalBoundary; otherwise exact
message ref. Fork uses original messages ref.

Model selection: explicit truthy->cloneModelSelection explicit, no runtime query.
Otherwise reverse COPY of source messages, map ALL: user->truthy info.modelSelection
clone, otherroles->requires truthy modelId/providerId then {modelId,providerId,conditional
truthy reasoningLevel options}. Find first truthy result AFTER map; then ALWAYS call
runtime.getSessionModelSelection even historical found. identity=historical??runtime;
none undefined. reasoningLevel=historical?.options?.reasoningLevel??runtime?.options?.reasoningLevel;
return {modelId,providerId,options:{reasoningLevel} only if !==undefined}. Do not inherit
other options in fallback path. Model entry created later with Date.now(), ordered
id:`${childID}:runtime-model-selection`,sessionID:childID,type:SESSION_ENTRY_MODEL_SELECTION,
touchSession:false,time:{created,updated},data:selection?cloneModelSelection(selection):null.

Referenced verifier IDs: for fork, Set in message anchor goalBoundary snapshot order,
then explicit boundarysnapshot IDs. Sidechat emptySet. If nonempty await captured
store.sessionEntries?.({sessionID:runtime.sessionId,type:SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION});
else [] (NO await). Nonempty with missingresult -> 'Stable fork verifier boundary cannot be loaded'.
Map returned entries ID->LAST record; each referenced ID in Set order must exist else
'Stable fork verifier boundary references missing entries',{verificationEntryId:id}.
Goal snapshots: Map targetID->snapshot target across message anchors then explicit
boundary; LAST target object wins, FIRST ID position retained. Sidechat [] instead.

Allocate child-local identities BEFORE clone/commit: fresh message/part/turn/productTurn/
target/verifierEntry/verification/toolCall maps. First notice identity factories:
hiddenMessage=createMessageId(),hiddenPart=createPartId(),message=createMessageId(),
part=createPartId(),turn=createTurnId(),productTurn=String(hiddenMessage). Then first
pass source messages: messageIDs.set(info.id,createMessageId()) for EVERY occurrence;
for each part partIDs.set(part.id,createPartId()); tool part->toolCallIDs.set(callID,
String(createToolCallId())); completedtool attachments eachpartID.set(attachment.id,
createPartId()). Duplicates overwrite with newID, retain mapinsertion position.
Second pass: add truthy string anchor.turnId once factoryturn; productTurn truthy string
once->String(mapped messageID if exists elsecreateTurnId()). Timelinepart anchorTurnId
same turnmap; goal_verification timeline assigns unseen targetIDs `fork_target_${randomUUID()}`
and unseen verificationIDs `fork_verify_${randomUUID()}`. Compaction compactBoundary.turnId
same turnmap. Then goalSnapshots assign unseen targetIDs. Then each selected entry:
verifierEntryIDs.set(entry.id,`fork_goal_verify_${randomUUID()}`); payload is object
nonarray else{}, assign string verificationId unseen evenempty; add truthy string
payload.anchorTurnId. Keep allocation order, never regenerate during clone.

Required mapping missing/falsy -> stableerror `Stable fork cannot remap ${field}`,{id}.
Clone each source info with cloneMessageForFork(info,{forkedSessionId:childID,messageIdMap,
nextMessageId,turnIdMap,productTurnIdMap,targetIdMap,verificationEntryIdMap,strictLocalReferences:true});
parts each clonePartForFork(part,{forkedSessionId:childID,nextMessageId,nextPartId:
partMap.get(id),partIdMap,messageIdMap,turnIdMap,targetIdMap,verificationIdMap,toolCallIdMap,
strictLocalReferences:true}). Sidechat then clone info,visibility:'model-only',semantics:
{origin:cloned.semantics?.origin??'migration',kind:cloned.semantics?.kind??'system_reminder',
conditionaltruthy source,uiVisibility:'hidden',providerVisibility:'visible',transcriptVisibility:'hidden'}.
Fork does not add these overrides.

Verifier clone: asRecord data/payload objectnonarray; targetId and verificationId must
strings else stableerror 'Stable fork verifier entry has invalid identity',{entryId}.
payload spread then required target mapping field 'verifier target', verification
mapping 'verification id'; optional string anchorAssistantMessageId mapped field
'verifier assistant anchor' (evenempty), optional string anchorTurnId field 'verifier turn anchor'.
Entry mapped ID field 'verifier entry'. Return entry {...entry,id:childEntryID,sessionID:childID,
data:{...data,eventId:randomUUID(),payload:clonedPayload,forkOrigin:{entryId:old.id,eventId:
data.eventId,verificationId:oldpayload.verificationId}}}, and SAME clonedPayload ref.

Create model entry; append sidechat boundary OR two fork notice messages described below.
Default commandFact only if options.commandFact nullish: ordered parentSessionId:String(runtime.sessionId),
sourceCommandId,ack:{commandId:sourceCommandId,status:'accepted',revisionAtDecision:options.revisionAtDecision??0,
result:{type:side?'createSelectionSideSession':'forkAssistant',sessionId:String(childID)}},
metadata:{forkOrigin:{parentSessionId:String(runtime.sessionId),targetMessageId:String(options.targetMessageId)},
conditionaltruthy options.target forkTarget:originalref}. Explicit fact untouched.
Goal for non-side snapshotboundary: {source:{...target,sessionID:childID,targetID:requiredmap
field'goal target',activeInputId:null,activeRunStartedAtMs:null,activeRunLastSeenAtMs:null},status:
originaltarget.status}; other undefined. No other target cloning/validation before commit.

Await captured store.commitForkBundle ordered child:childInput,messages:copied+notices,
copySources:{messages:Object.fromEntries(messageMap reversedtarget->source),parts:reversepartMap},
entries:[...clonedVerifierEntries,modelSelectionEntry,buildExecutionStateEntry(childID,state)],
conditionaltruthy goal,conditionaltruthy options.initialInput,commandFact. No earlier
writes. Result childID=committedChild.id (may differ). Non-side create parent SessionForked
{originalSessionId:runtime.sessionId,forkedSessionId:returnedID,forkPoint:options.messages.length,
targetMessageId,restoredFileCount:0,strategy:ForkRequired} OUTSIDE eventcatch. Try await
runtime.appendEvent; catch optional warn 'Parent fork event append failed after durable fork commit'
{...traceLog,error:Error.message else String(error),event:'session.fork.parent_event.failed_after_commit',
forkedSessionId,module:'core.runtime',parentSessionId:runtime.sessionId}. Side no event.
Return {copiedMessageCount:options.messages.length,forkedSessionId,parentSessionId,
targetMessageId,restoredFiles:fresh[],response:side?`Created selection side chat ${childID}.`:
`Forked session ${childID} from message ${target}: copied ${options.messages.length} messages.`}.

## Atomic notice stored formats

Fork notice timestamp Date.now once; IDs from allocated notice. copiedanchor=messageMap
.get(targetMessageId)??hiddenID; sharedanchor {turnId:noticeTurn,productTurnId:noticeProduct,
orderedMessageIds:[hiddenID,noticeID],boundaryMessageId:noticeID}; shared forkOrigin
{parentSessionId:runtime.sessionId,targetMessageId}. ALWAYS query runtime selection,
then use options.selection??runtimeSelection. Two ordered records:
Hidden info: id:hiddenID,sessionID:child,role:user,time:{created},agent:config.agentName??agent,
modelSelection:selection&&clone,synthetic:true,source:fork,visibility:model-only,
semantics:{origin:system,kind:fork_notice,uiVisibility:hidden,providerVisibility:visible,
transcriptVisibility:hidden},anchor,metadata:{forkOrigin}. One textpart id:hiddenPart,
sessionID:child,messageID:hiddenID,type:text,text:formatConversationForkNoticeBody(forkOrigin),
synthetic:true,time:{start:created,end:created},metadata:buildSyntheticUserNoticePartMetadata
('fork','model-only',{forkOrigin,runtimeMessage:systemReminderRuntimeMetadata('conversation_fork')}).
Visible info: id:noticeID,sessionID:child,role:assistant,time:{created,completed:created},
parentID:hiddenID,modelId:selection&&createModelId,providerId:selection&&createModelProviderId,
conditionaltruthy reasoningLevel,spread suppliedexecutionState??readRuntimeExecutionState(runtime),
agent,path:{cwd:workingDirectory,root:workspaceRoot},cost:0,tokens:emptyTokenUsageInfo(),
finish:completed,semantics:{origin:system,kind:timeline_event,uiVisibility:visible,
providerVisibility:hidden,transcriptVisibility:visible},anchor,metadata:{forkOrigin}.
One timelinepart id:noticePart,sessionID:child,messageID:noticeID,type:timeline,
timelineType:session_fork,display:separator,status:completed,anchorMessageId:copiedanchor,
anchorTurnId:noticeTurn,sourceCommandId,parentSessionId:runtime.sessionId,targetMessageId,
restoredFileCount:0,time:{start:created,end:created}. Shared anchor/origin refs matter.

Side boundary: Date.now then messageIDfactory then turnIDfactory. User info id,sessionID,
role:user,time:{created},agent,modelSelection:selection&&clone,synthetic:true,source:
selection_side_chat,visibility:model-only,semantics:{origin:system,kind:system_reminder,
source:selection_side_chat,uiVisibility:hidden,providerVisibility:visible,transcriptVisibility:hidden},
anchor:{turnId,productTurnId:String(messageID),orderedMessageIds:[messageID],boundaryMessageId:
messageID,origin:synthetic}. One textpart IDfactory,sessionID,messageID,type:text,text
EXACT three sentences joined single space: 'The preceding conversation was inherited from the parent task for reference only.'
'Do not continue the parent\'s active work automatically; answer only new questions sent in this side chat.'
'Modify the workspace only when the user explicitly asks you to do so in this side chat.'
synthetic:true,time:{start:created,end:created},metadata:buildSyntheticUserNoticePartMetadata
('selection_side_chat','model-only',undefined). Fixed prose retained, not author-original.

## Legacy conversation fork and goal copy

forkConversationFromMessage: legacy storeguard,getSession/missingparenterror,messages,
active source,FIRST target index; missing stableerror `Fork target message not found in session store: ${id}`,
{messageId}. Resolve end(source,index,true) ALWAYS even beforeTarget. If options.beforeTarget
truthy choose history-before-input; else buildForkHistoryMessages. await createForkedSession
(runtime,{forkedSessionId,parentSession}), await runtime.copySessionMessagesForFork
{forkedSessionId,messages:history,traceContext}; await copyGoalStateForFork.call(runtime,
{forkedSessionId,messageIdMap,traceContext}). copiedTarget=map.get(target),created=Date.now();
await persistAssistantTimelinePartForSession ordered sessionId,messageIDfactory,partID:
createPartId(`fork_${String(runtime.sessionId)}_${String(target)}_timeline`),parentID:copiedTarget,
created,completed:created,finish:completed,timeline:{timelineType:session_fork,display:
separator,status:completed,anchorMessageId:copiedTarget,parentSessionId,targetMessageId,
restoredFileCount:0,time:{start:created,end:created}},traceContext. Await syntheticnotice
ordered messageIDfactory,sessionId,source:fork,text:formatConversationForkNoticeBody
{parentSessionId,targetMessageId},metadata:{forkContext:{kind:session_fork,parentSessionId,
targetMessageId,restoredFileCount:0}},traceContext. Debug 'Conversation fork notice persisted'
{traceLog,event:'session.fork.notice.persisted',forkedSessionId,module:'core.runtime',parentSessionId,
status:'completed',targetMessageId}; create SessionForked payload same atomic shape
except forkPoint:resolvedlegacyend; await append OUTSIDE catch. Return copiedcount etc
same atomicfork response using actualcopiedcount. All partial effects retained onfailure.

copyGoalStateForFork: capture store; absent cloneTargetForFork return; goalBoundarykindnone
return. Snapshotboundary uses suppliedtarget else await store.readTarget({sessionID});
no targetreturn. Snapshot target.sessionID String must equal runtime session String else
'Stable fork goal snapshot belongs to another session',{goalSessionId,parentSessionId}.
Await verifiercopy below with childID,messageMap,parentSessionId,parentTargetId,conditional
snapshot verificationEntryIds Set. Forkstatus snapshot originalstatus; otherwise last
copiedpayload statuscompleted && truthy verification (reversecopy) if passed===true ->complete;
else parentcomplete->active; else parentstatus. Await captured store.cloneTargetForFork
{sessionID:child,source:originaltarget,status}; debug 'Forked session goal state copied'
{traceLog,copiedGoalVerificationCount,event:'session.fork.goal_state.copied',forkedSessionId,
module:'core.runtime',parentSessionId,targetId:parentTarget.targetID}.

Verifiercopy native async: if either !store.sessionEntries OR !store.saveSessionEntry,
nonempty explicitboundaryset -> error 'Stable fork verifier boundary cannot be loaded',
{verificationEntryIds:[...set]},else[]return. Await entries{sessionID:parent,type:TARGET_COMPLETION_VERIFICATION}.
If explicitset keep only listedentries; remainingSet initiallycopy; delete seenID BEFORE
clone. Clone payload records nonarray; wrongtarget->null; optional string anchorAssistantMessageId
if truthy and not messageMap ->null. childanchor=truthyanchor?map.get:undefined. Payloadspread;
if truthychildanchor override assistantanchor. If typeof old anchorTurnId string DELETE
anchorTurnId and set originAnchorTurnId evenempty. eventId=randomUUID; entry {...old,id:
`fork_goal_verify_${eventId}`,sessionID:child,data:{...olddata,eventId,payload:cloned}}.
If clone null with explicitset -> 'Stable fork verifier is outside the fixed transcript cut',
{verificationEntryId}; else skip. Await saveEntry then push samepayloadref. After loop
remainingIDs nonempty->'Stable fork verifier boundary references missing entries',
{verificationEntryIds:[...remaining]}. Goalcopy old targetIDs remain (legacy adapter owns clone).
No extra retries, notifications, transaction fallback or target cleanup.
