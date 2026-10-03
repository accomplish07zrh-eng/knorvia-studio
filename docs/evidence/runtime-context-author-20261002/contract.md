# Expert workflow context — functional author packet

Implement complete expert/runtime-context.ts. Public API is api.d.ts; dependency
ports are dependencies.d.ts. Read only these three files; do not read old source,
history, tests or compiled implementation. Save/hash draft.ts before review. Native
class/method/helper organization is your choice; no new state owner, policy, cache,
framework or external IO. Public definitions/types are unchanged production imports.

## Dependency capture and lifetime

The instance has the public properties in api.d.ts and an initially empty per-instance
activeRunAbortControllers Map. Constructor capture order is observable:

1. WorkflowDefinitionSchema.parse(deps.definition nullishly defaulted through createExpertWorkflowDefinition()) -> definition
2. workflowDefinitionPhaseMap(definition) -> phaseDefinitions
3. deps.agentRunner -> agentRunner (same ref)
4. deps.createActivityId nullishly defaulted to function producing `act_${randomUUID()}`
5. deps.createRunId nullishly defaulted to function producing `wf_${safeRunIdSegment(this.definition.kind)}_${randomUUID()}`; kind read when that default function runs
6. deps.now nullishly defaulted to () => new Date()
7. deps.onWorkflowEvent
8. deps.store (same ref)
   Capture once in this order; parsing errors stop later reads. The schema/map helpers
   retain existing normalization/default behavior. Methods call captured funcs with
   instance receiver, store ports with store receiver. No ports are rebound. timestamp
   calls this.now() then toISOString() on that returned object. Exceptions propagate.

## Snapshots and synchronous projections

createInitialSnapshot: createRunId first, timestamp second, retain definition.phaseOrder
reference. Return ordered own fields: activities=[]; artifacts=[]; createdAt=timestamp;
cwd=options.cwd; definitionId; definitionVersion; graph=createPhaseGraph(this.definition);
kind; phaseOrder; phases=new array of {phase,status:"pending"} for each order occurrence;
recoveryActions=[]; runId; schemaVersion=1; sessionId=options.sessionId; sessionLinks=[];
status="pending"; strategy=definition.strategy (same ref); task=options.task;
traceId=options.traceContext?.traceId; updatedAt=timestamp. Optional keys exist even
when undefined. Repeated order entries remain repeated; arrays are fresh except
phaseOrder/strategy, which are shared.

updateSnapshot returns {...snapshot,...patch,updatedAt:this.timestamp()}, without
mutating inputs. Clock after spreads. updatePhase merges patch into every phase entry
whose phase matches, leaving nonmatching refs unchanged; graph is delegated to
updateGraphNodeStatus(snapshot.graph,phase,patch.status). Result changes currentPhase
and goes through this.updateSnapshot with patch {currentPhase:phase}. Preserve method
lookup/receiver before constructing its first argument, and projection field/read
order: snapshot spread,currentPhase,graph delegate,phases map; no independent clock.

addArtifact filters out every old item with path equal to supplied artifact.path,
appends that exact artifact last, then returns snapshot spread,artifacts array,
updatedAt=timestamp. Compute the array before spreading snapshot; comparison reads
the supplied artifact.path per old item, not a captured key. Other item refs remain.
upsertActivity follows the same ordering for activityId, then return fields snapshot
spread,activities,sessionLinks=deriveWorkflowSessionLinks({activities,runId:snapshot.runId}),
updatedAt=timestamp. Derived links use exactly the new array; no parallel state.

## Ordered publication

Native async methods retain all specified awaits even when ports return sync values,
no-ops or resolved promises. No extra async dispatch layer and no catches/retries.
writeInitialGraph(snapshot,signal): await appendGraphRecord(runId,meta,{signal}); meta
ordered fields createdAt,definitionId,definitionVersion,phaseOrder,recordType:"meta",
runId,schemaVersion:1,strategy. Then sequential ordinary array iteration over live
snapshot.graph.nodes, then edges, then collections nullishly defaulted to []. Each
record contains ordered node/edge/collection ref, recordType matching that name,
runId and fresh timestamp. Retain refs; retrieve next group only after previous group
settles. Mutation by a port can affect remaining records. Partial failure rejects
unchanged and stops publication.

appendGraphNodeStatus: await store.appendGraphRecord(snapshot.runId, ordered record
nodeId,phase,recordType:"op",runId,status,timestamp=timestamp(),type:"update_status",
{signal}). appendGraphStatus is a native async wrapper awaiting this method with
(snapshot,phaseNodeId(phase),status,signal,phase), preserving that settlement gate.
appendLifecycleGraphChanges iterates change occurrences, awaiting appendGraphNodeStatus
(snapshot,change.nodeId,change.status,signal,change.phase); empty path remains native
async, with no effects and no invented await.

appendEvent defaults omitted/undefined options to {}. Construct exactly ordered
fields kind=this.definition.kind,message=options.message,nodeId=options.nodeId,
payload=options.payload (same ref),phase=options.phase,runId,timestamp,type.
Await store.appendEvent(event,{signal:options.signal}); only then read and optional-call
this.onWorkflowEvent(event) with instance receiver and await its result (including
undefined when absent). Same event ref passed to both; callback sees port mutations.
Callback failures occur after append and propagate; do not capture callback before
append, clone/freeze payload or collapse the second await.

## Lookup and abort registration

resolveSnapshot native async: if options.runId truthy, return await store.readRun
(options.runId,{signal:options.abortSignal}); otherwise return await readLatestRun
({cwd:options.cwd,kind:this.definition.kind},{signal:options.abortSignal}). Preserve
truthiness and exact null result; no lookup cache or fallback from explicit runId.
getPhaseDefinition returns exact map entry, or throws Error(`${this.definition.title} definition is missing phase: ${phase}`).

registerRunAbortSignal creates a native AbortController and forwarding callback, then
map.set(runId,controller) BEFORE external inspection/subscription. If externalSignal
is already aborted, synchronously forward; else optional addEventListener("abort",
callback,{once:true}). Do not add a post-install abort check. Forwarding calls internal
abort with externalSignal.reason when instanceof Error (read reason again), otherwise
new Error("Workflow aborted"). Preserve native abort identity/idempotence; no fallback
scheduling. Listener installation errors propagate with existing map entry retained.
No cancellation of an older controller when the same runId is registered again.
Return ordered fields dispose callback,signal=controller.signal. Every dispose call
optional-removes listener first, then deletes map entry ONLY when its current value
is the captured controller. Thus stale disposal leaves a newer registration intact;
removal throws before map access and does not clear map. Disposing does not abort.

## Exported small protocol projections

lifecyclePayload returns ordered activityIds=result.activityIds (same ref),
nodeIds=new array of nodeChanges.nodeId for every occurrence,phaseIds=result.phaseIds
(same ref). compactWorkflowPayload reproduces Object.entries + undefined-only filter

- Object.fromEntries semantics: own enumerable string keys only, insertion order,
  values/refs retained (null/false/0 included), ordinary property-descriptor behavior.
  dedupeWorkflowNodeChanges uses nodeId grouping: first occurrence determines key
  order, last occurrence supplies exact output object reference. Do not mutate input.
  These constrained protocol helpers are conventional glue, no artificial novelty needed.

This source-derived functional packet is prepared by an exposed curator. Fresh
restricted-input authoring is process evidence; shared filesystem is not a technical
clean room and similar constrained/discretionary expression needs separate review.
