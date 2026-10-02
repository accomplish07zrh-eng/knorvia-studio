# Runtime commands and manual retry — functional/API-only packet

Write complete runtime.ts and retry-state.ts, exactly the exports in api.json. Read
only this contract and api.json; no predecessor source/history/tests/oracles. Save
both drafts and hashes before review. Import existing production dependencies; do not
rewrite context, run-loop, lifecycle or formatting. One private context instance per
runtime, constructed immediately from original deps; no second command/run registry.
All public async methods stay native async, all listed awaits remain native gates.

## Runtime command admission and continuation

start: createInitialSnapshot(options); await store.writeSnapshot(snapshot,{signal:options.abortSignal});
await context.writeInitialGraph(snapshot,options.abortSignal); await appendEvent
(snapshot.runId,"run_started",{message:`${definition.title} started.`,signal});
registerRunAbortSignal(snapshot.runId,options.abortSignal) only after publication.
Within try/finally, return await continueRun(context,snapshot,{...options,abortSignal:registration.signal});
finally dispose registration. Errors before registration do not dispose anything.

startBackground: same initial publication; updateSnapshot(snapshot,{startedAt:snapshot.startedAt
?? timestamp(),status:"running"}); await writeSnapshot(running,{signal}); register
using initial snapshot.runId. Start continueRun(context,running,{...options,abortSignal:registration.signal})
WITHOUT await. Chain .catch(async error => if registration.signal.aborted return;
otherwise await appendEvent(initial.runId,"run_failed",{message:Error.message OR String(error)}))
and .finally(() => registration.dispose()). Preserve failure delivery and no extra
catch on that chain. Immediately return ordered response=formatExpertWorkflowStatus(running),
runId,snapshot=running,status,traceId. No reportPath field. No new cleanup/retry policy.

resume: await resolveSnapshot(options). Falsy result -> {response:"No expert workflow found."}.
isTerminalStatus(status) -> ordered status-result response,runId,snapshot,status,traceId
without writes. Otherwise reconcileWorkflowSnapshotForResume(snapshot,{timestamp:timestamp()});
new resumed={...repair.snapshot,status:"running",updatedAt:timestamp()}; await write
with options signal; await appendLifecycleGraphChanges(resumed,repair.nodeChanges,signal).
If repair.changed, await event graph_updated with message "Workflow resume repaired stale active work.",
payload:lifecyclePayload(repair),signal. Then register abort and try/finally return await
continueRun with ordered input abortSignal=registration.signal,cwd=resumed.cwd,
onEvent=options.onEvent,sessionId=resumed.sessionId,task=resumed.task,traceContext=options.traceContext.
Dispose in finally. No default status/report extra projection.

status: resolveSnapshot; same missing result. Otherwise return ordered reportPath,
response=status formatter,runId,snapshot,status,traceId. Optional keys remain present.

retry: resolveSnapshot; same missing result. Only completed/cancelled short-circuit
with status-result (failed IS admitted). prepareSnapshotForRetry(context,snapshot,options),
await write prepared.snapshot with signal; await appendLifecycleGraphChanges(prepared.snapshot,
prepared.nodeChanges,signal); await workflow_retry_started event using prepared snapshot
runId, message `${definition.title} retry started.`, payload ordered activityId=options.activityId,
nodeId=options.nodeId,phase=options.phase??prepared.snapshot.currentPhase,
resetNodeIds=prepared.nodeChanges.map(nodeId), then options phase same fallback,signal.
Register on prepared snapshot and return await continueRun inside try/finally with
same ordered input as resume, using prepared fields. Preserve current reads after awaits.

cancel: resolveSnapshot; same missing and isTerminalStatus short-circuit. Invoke
cancelWorkflowSnapshot(snapshot,{timestamp:timestamp()}); capture repair.snapshot.
Await write with signal; await lifecycle changes with signal; await run_cancelled
message `${definition.title} cancelled.`, payload=lifecyclePayload(repair),signal.
ONLY after successful publication, context.activeRunAbortControllers.get(original.runId)
optional abort(new Error("Workflow cancelled")). Return status-result for captured
cancelled snapshot. Any write/event failure rejects and leaves controller un-aborted.

list: return await store.listRuns({cwd:options.cwd,kind:definition.kind,limit:options.limit},{signal}).
events: await store.readEvents(options.runId,{signal}); return original array when
limit===undefined; otherwise events.slice(-Math.max(0,options.limit)). In particular
0/negative limit returns a copy of ALL events, not empty. Preserve native JS slice.

Export ExpertWorkflowRuntime class AND WorkflowRuntime as same constructor alias.
Receiver identity of context/store and passed snapshot/options/callbacks is retained.
No early abort gate or error catch beyond existing background chain/finally.

## Retry projection

Synchronous prepareSnapshotForRetry: capture timestamp FIRST. If options.activityId
truthy, find FIRST snapshot.activities matching options.activityId; otherwise absent.
phase = options.phase ?? activity.phase ?? snapshot.failure.phase ?? snapshot.currentPhase;
nodeId = options.nodeId ?? activity.nodeId ?? snapshot.failure.nodeId.
If nodeId truthy, scope Set containing it. Else collect nodes satisfying (!phase OR
node.phase===phase OR node.id===phaseNodeId(phase)), THEN select failed/active status,
THEN project node IDs into Set. Selection preserves occurrence order and two read phases.
Call reconcileWorkflowSnapshotForResume(snapshot,{nodeIds:scope.size>0?scope:undefined,timestamp}).
Copy returned nodeChanges array. Map returned nodes: if scope lacks id OR status is
neither failed nor active, preserve ref. Else append ordered change {nodeId,phase,status:"pending"}
and return {...node,error:undefined,status:"pending"}. Map phases: only if phase truthy
and matches and status failed/active, return {...entry,completedAt:undefined,error:undefined,
status:"pending"}; other refs unchanged. NodeScope is NOT recalculated after repair.
Return ordered nodeChanges=dedupeWorkflowNodeChanges(copied changes), snapshot with
returned snapshot spread then failure:undefined,graph:{collections,edges,nodes:resetNodes},
pauseReason:undefined,phases:resetPhases,recoveryActions:[],sessionLinks=deriveWorkflowSessionLinks
({activities:repair.snapshot.activities,runId:repair.snapshot.runId}),status:"running",
updatedAt:captured timestamp. Preserve all refs, undefined-key presence and helper
error propagation; no input mutation or additional clock calls.

Dependencies: context class/lifecyclePayload from ./runtime-context.js; continueRun
from ./run-loop.js; prepareSnapshotForRetry from ./retry-state.js; lifecycle repair
from ../lifecycle.js; status formatter from ./formatters.js; isTerminalStatus/phaseNodeId
from ./ids.js; deriveWorkflowSessionLinks and contract types from @knorvia/contracts.
All production type names appear in api.json. Other imported dependency API facts
are supplied here; no executable predecessor body supplied. Source-exposed curator,
shared-filesystem instruction boundary, no clean-room or licence claim.
