# Expert workflow continuation — functional author packet

Write the complete `workflow/expert/run-loop.ts` module. Exactly one public native
async function, `continueRun(ctx, initialSnapshot, options)`. Types and dependency
APIs are in api.d.ts. Read no predecessor source, history, tests or compiled oracle.
Save draft.ts and SHA256 before curator inspection. Private representation is your
choice; no new retry policy, queues, generic interpreter or external IO.

## Ownership and supported callers

Runtime start/background/resume/retry already prepare snapshots, register a run
abort signal, call this function, and dispose their registration. Retry preparation
is separate. This function keeps one latest accepted snapshot reference per call;
context helpers own immutable projections, clocks and effects. All ctx/store methods
keep their receiver. Do not copy passed snapshots/options/phase definitions; pass
references through dependencies. Each invocation is independent. No early abort
admission check or parallel phase launch. All strings below are compatibility text.

## Starting and traversing

Before the recoverable region, call ctx.updateSnapshot(initialSnapshot, patch):
patch keys `startedAt` (initial.startedAt nullishly falls back to ctx.timestamp()),
then `status: "running"`. A throw here rejects directly, without reading storage.
This projected reference is the accepted snapshot; do not persist it at this step.

Traverse ctx.definition.phaseOrder with ordinary array iteration, in order. Resolve
each id using ctx.getPhaseDefinition. A `complete` behavior finalizes immediately,
even when its matching phase is already completed, and stops the traversal only
on successful finalization. Otherwise find the first snapshot.phases item whose
phase equals the definition.phase; skip if its status is completed. Other statuses
are admitted. Unknown behavior makes no transition. Dispatch recognized behavior:

- scheduled_graph: await runScheduledPhase(ctx, current, definition, options), then
  accept its returned reference.
- critic: same using runFinalCriticLoop; critic retry policy stays in that dependency.
- agent: await runPhase with same arguments; accept returned snapshot, then await
  seedGraphFromPhaseArtifact(ctx,current,definition,result.response,options.abortSignal)
  and accept it, then await updateNodePromptsFromPhaseArtifact with the same argument
  roles and accept it. A rejected stage does not replace the previous accepted ref.

No extra async dispatch layer. Each listed await remains a native await, including
already-resolved results; accepting a result occurs after that await. Completion
is a native async suboperation awaited once by traversal, with its internal gates
listed next; preserve this settlement boundary. Successful traversal returns an
object with ordered keys: reportPath=current.reportPath, response from
formatExpertWorkflowCompletion(current), runId, snapshot=current, status, traceId.
All six keys exist, including undefined values. Formatting errors enter recovery.

## Completion and partial publication

buildReport(current); await ctx.store.writeReport(current.runId, report, {signal}).
Signal is captured from options.abortSignal when completion is entered, retained
through its gates. Use the returned relativePath, not an independently derived path.
Then ctx.updatePhase(current,definition.phase, ordered patch: artifactPath,
completedAt=timestamp(), startedAt=timestamp(), status="completed"). Project whole
run using ctx.updateSnapshot(phaseProjection, ordered patch: completedAt=timestamp(),
reportPath, status="completed"). Then ctx.addArtifact(runProjection, ordered fields:
contentType="text/markdown", createdAt=timestamp(), label="Report", path=relativePath,
phase=definition.phase). Do not merge these projection calls or their clock reads.
The resulting reference is used for sequential native awaits:

1. store.writeSnapshot(result,{signal})
2. ctx.appendGraphStatus(result,definition.phase,"completed",signal)
3. ctx.appendEvent(result.runId,"run_completed",{message:`${ctx.definition.title} completed.`,signal})
   Return this exact reference. Traversal accepts it only after the whole suboperation
   settles. Failure can therefore occur after persistence but before cursor acceptance.

## Recovery

Any traversal/phase/completion/output error triggers exactly one native await of
store.readRun(accepted.runId, options.abortSignal?.aborted ? undefined :
{signal:options.abortSignal}). A nullish read falls back to the accepted reference.
After the read, derive message via Error.message or String(error), then read current
abort state again. Read/message/repair failures reject unchanged; there is no nested
recovery. Do not wrap errors or automatically retry. Live port mutation is observable;
do not precompute later fields/payloads across publication awaits.

When now aborted: if loaded.status is already cancelled, return without writes.
Otherwise call cancelWorkflowSnapshot(loaded,{reason:message,timestamp:ctx.timestamp()});
await store.writeSnapshot(repair.snapshot) with only that one argument; await
ctx.appendLifecycleGraphChanges(repair.snapshot,repair.nodeChanges) with exactly two
arguments; await ctx.appendEvent(repair.snapshot.runId,"run_cancelled", ordered
options message, payload=lifecyclePayload(repair)). No aborted signal is supplied.
The return has ordered fields response=formatExpertWorkflowStatus(chosenSnapshot),
runId, snapshot, status, traceId; reportPath is absent even when snapshot has one.

When not aborted: latestWorkflowActivity(loaded), then
workflowFailureFromError(originalError,message,activity), then ctx.updateSnapshot
with ordered patch failure, pauseReason=failure.message,
recoveryActions=workflowRecoveryActions(failure), status="paused". Await
store.writeSnapshot(paused,{signal:options.abortSignal}); then await ctx.appendEvent
(paused.runId,"workflow_paused", ordered options message,
payload=compactWorkflowPayload({failureKind:paused.failure?.kind,retryable:paused.failure?.retryable}),
phase=paused.currentPhase, signal=options.abortSignal). Return ordered keys
response=`${formatExpertWorkflowStatus(paused)}\n\nPaused: ${message}`,
runId, snapshot=paused, status, traceId. reportPath absent. Recovery success resolves
this result rather than rethrowing the initial error. Snapshot/helper outputs and
error objects must retain their identities.

No developer narrative from the predecessor is supplied. Curator is source-exposed;
this contract is source-derived. Ordinary API/field/string/await idioms may coincide;
no claim of absolute clean room or automatic whole-file licence eligibility.
