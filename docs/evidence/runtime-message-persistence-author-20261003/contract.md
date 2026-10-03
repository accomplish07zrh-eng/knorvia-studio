# Message publication owner — body-free functional packet

Read only this contract and api.d.ts; preserve those public types/signatures. Implement
message-persistence.ts plus a cohesive message-persistence-* helper only if necessary
(<400 lines/file). Save/hash draft before comparison. No old source/history/tests/oracle,
other packets, production edits, builds, live IO or providers. Curator is source-exposed;
these schema/order facts are source-derived. Private representation is author choice.

Dependencies (unchanged): type RuntimeInputPresentation and factories createModelId/
createModelProviderId @knorvia/contracts; ../deps.js enum SessionEventType, factory
createPartId, traceContextToLogContext and public API types; ../internal.js type
AgentRuntimeInternal; ../types.js ResolvedTurnAttachment; ../helpers/index.js
emptyTokenUsageInfo/toTokenUsageInfo; ./input-intent-persistence.js
buildPersistedConversationInputIntent(text,intent,phase); ./projection-anchor.js
buildProjectionAnchor(trace,origin?,sourceCommandId?), mapSyntheticSourceToAnchorOrigin;
./synthetic-notice-metadata.js buildSyntheticUserNoticeMessageMetadata(source,visibility,
metadata?), buildSyntheticUserNoticePartMetadata same, buildSyntheticUserNoticeSemantics
(source,visibility). Do not read/change these dependency bodies.

Runtime uses live this.sessionStore receiver, this.persistMessage/input trace and
this.persistPart/input trace, this.config, sessionId, cwd/workspaceRoot, getTools(),
getSessionModelSelection(), getPlanEnabled(), eventStore, eventReducer, logger. No
abort check or policy addition. Every exported async function remains native async,
including missing-store no-ops. Keep one write owner; no cache, retries or new lock.

## User prompt

Set latestConversationMessageId before store guard; absent store returns without clock.
Capture Date.now once, then construct tools from ALL getTools() names -> true; duplicates
last wins. Derive input intent with phase drained. Stored message ordered fields:
id,sessionID,role:user,time:{created},agent:config.agentName??agent,modelSelection:
getSessionModelSelection(),contextSnapshot:envInfo?{envInfo:shallow clone config.envInfo}:
undefined,semantics:{origin:real_user,kind:user_prompt,uiVisibility:visible,
providerVisibility:visible,transcriptVisibility:visible},anchor:buildProjectionAnchor
(trace,realUser,intent.sourceCommandId??sourceCommandId),system:config.systemPrompt,tools.
Metadata property exists only when truthy inputPresentation/steerDelivery/clientId/intent/
executionKind OR epilogueStart!==undefined. Ordered conditional metadata keys:
turnSteerDelivery truthy, inputPresentation truthy, inputIntent truthy (original ref),
conversationInputIntent truthy, inputClientId from intent.clientId??clientId if truthy,
executionKind truthy, epilogueStart if !==undefined (zero retained).

Parts are built BEFORE writes: first text {id:factory,sessionID,messageID,type:text,text:
input,time:{start:created,end:created}}, then attachments in input order each {id:factory,
sessionID,messageID,type:file,mime,filename,url,source,metadata}; original source/metadata
refs shared. No attachment array yields just text. If truthy sessionInputId AND live
store.promoteSessionInput, await that port with {id:sessionInputId,sessionID,message,parts},
then debug label Session input promoted with traceLog,event:session_input.promoted,
messageId,module:core.runtime,sessionInputId,status:completed. AFTER commit read options
again: sourceCommandId=intent.sourceCommandId??sourceCommandId??sessionInputId.
Create SessionInputPromoted with {pendingInputId,sourceCommandId,messageId},trace; await
runtime.appendEvent(event,trace), then return. No separate saveMessage/savePart calls
on promotion. If commit fails nothing publishes; event failure leaves committed data.
Otherwise await runtime.persistMessage(message,trace), then each part sequentially via
persistPart. Stop on original thrown/rejected error; partial writes remain.

## Synthetic notice

persistSyntheticUserNotice delegates with await to runtime.persistSyntheticUserNoticeForSession
({messageID,sessionId:this.sessionId,source:rewind,text,traceContext}).
ForSession updates latestConversationMessageId only when option sessionId equals current,
BEFORE absent-store no-op. Capture created once; visibility defaults model-only. Derive
message metadata then part metadata using original options source/metadata. Await message
ordered id,sessionID,role:user,time:{created},agent defaultagent,metadata,messageSelection
key actually named modelSelection:getSessionModelSelection(),semantics:dependency,
anchor:buildProjectionAnchor(trace,mapSyntheticSourceToAnchorOrigin(source)),source,
system:config.systemPrompt,synthetic:true,tools:Object.fromEntries(all current tool names
->true),visibility. Then build/await text part with new ID after message await: ordered
id,sessionID,messageID,type:text,text:options.text,synthetic:true,time:{start:created,
end:created},metadata:previously derived partMetadata. Read options session/id/text/trace
live at this later boundary; do not cache them across the first write.

## Assistant and low-level writes

Assistant updates latestConversationMessageId/latestAssistantMessageId before guard;
updates latestAssistantTurnId only if trace.turnId truthy. After guard query selection;
providerId=model?.providerId??(selection&&factory(selection.providerId)), then analogous
modelId. Await message ordered id,sessionID,role:assistant,time:{created,completed:
update?.completed},error:update?.error,parentID,modelId,providerId,mode:config.mode??build,
planEnabled:getPlanEnabled(),agent:config.agentName??agent,path:{cwd:workingDirectory,
root:workspaceRoot},cost:0,tokens:update?.tokens??emptyTokenUsageInfo(),finish:update?.finish,
semantics:{origin:agent_runtime,kind:assistant_response,uiVisibility:visible,
providerVisibility:visible,transcriptVisibility:visible},anchor:buildProjectionAnchor(trace).
Explicit model identity takes precedence; preserve update object refs.

persistMessage: missing store return; await live store.saveMessage(input,copyFrom), then
debug Session message persisted with traceLog,event:session.message.persisted,messageId:
input.id,module:core.runtime,role:input.role,status:completed. No catch.
persistPart same savePart then Session part persisted, keys traceLog,event:
session.part.persisted,messageId:input.messageID,module:core.runtime,partId:input.id,
partType:input.type,status:completed. Do not log success before write or on rejection.
rebuildProjection awaits eventStore.getEvents(sessionId), returns eventReducer.reduce
(events), native promise adoption; no extra helper-await boundary or clone.
