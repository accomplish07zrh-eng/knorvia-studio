# Functional contract: expert phase execution

Read this and api.d.ts only. Produce the complete runPhase owner, using existing
ports/dependencies, not a wrapper around unknown code. Save/hash the draft before
curator comparison. No repository/history/tests/oracles access. Representation is
your choice; ordinary idioms need no novelty. Preserve fixed strings and protocol
expressions as compatibility material, with no automatic whole-file rights claim.

## Invocation and activation (outside recovery)

runPhase is native async. Synchronous order before its first await: obtain one
ctx.createActivityId(); collect snapshot.artifacts paths in order (one shared array
used by every activity from this invocation); if options.traceContext is truthy,
call createChildTraceContext(parent, options) with options keys attributes then
sessionId. Attributes keys are workflowActivityId, workflowKind=ctx.definition.kind,
workflowPhase=definition.phase, workflowRunId=snapshot.runId; sessionId comes from
the parent. Otherwise child trace is undefined. Keep that resulting trace reference.

Use ctx.updatePhase(input,definition.phase,patch) to obtain activation A. Patch keys:
activityId, error=undefined (present), startedAt=new ctx.timestamp(), status="active",
traceId=childTrace?.traceId (present). Use ctx.upsertActivity(A,activity) to obtain R.
Activity keys: activityId,inputArtifactPaths,kind="agent_session",nodeId from
phaseNodeId(definition.phase),outputArtifactPaths=[],parentSessionId=A.sessionId,
phase=definition.phase,startedAt=new timestamp,status="active",traceId=childTrace?.traceId.

Await ctx.store.writeSnapshot(R,{signal:options.abortSignal}); then await
ctx.appendGraphStatus(A,definition.phase,"active",options.abortSignal); then await
ctx.appendEvent(A.runId,"phase_started",{message:`${definition.title} started.`,
phase:definition.phase,signal:options.abortSignal}). These effects and all earlier
work are outside recoverable execution: any error rejects directly without failed
projection/publication. No explicit early abort check. R now initializes one local
live cursor C. A and input paths remain invocation anchors, not a duplicate cursor.

## Recoverable execution and runner input

Everything below except recovery itself is within one recovery boundary. Invoke
and await ctx.agentRunner.run with keys in this order: abortSignal,activityId,cwd,
onChildSessionStarted,onEvent,parentSessionId,phase,prompt,runId,task,traceContext,
workflowKind. Values: options abortSignal/cwd/onEvent; shared ID; async child callback;
A.sessionId; definition.phase; buildPhasePrompt(C,definition); A.runId; A.task;
child trace reference; ctx.definition.kind. Preserve runner/context/store receivers
and resolve methods when invoked, not across asynchronous waits. All signal option
objects retain the signal key, even for undefined. No retry loop is added.

### Child callback and cursor

Callback is native async. Find the first C.activities member with invocation ID.
If absent or not active, resolve with no effect. Otherwise update C through
ctx.updatePhase(C,definition.phase,patch), then ctx.upsertActivity(updated,activity),
and assign the resulting reference to C BEFORE awaiting its write.
Patch keys: sessionId=event.sessionId,traceId=event.traceId??current.traceId,
turnId=event.turnId??current.turnId. Activity starts with the full current spread,
then truthy event.model override only, then sessionId,traceId,turnId (same fallback).
Await writeSnapshot(C,{signal}); then appendEvent(C.runId,"workflow_session_linked",
options). Read C again after write settlement, not a callback-local frozen runId.
Options keys: message=`Workflow session linked: ${event.sessionId}`,nodeId=
phaseNodeId(definition.phase),payload,phase,signal. Payload order: activityId,
truthy event.model if any,sessionId,truthy event.traceId if any,truthy event.turnId
if any. Payload omits missing/falsy optional fields instead of emitting fallbacks.

Callback failure does not roll back C. Concurrent callbacks share only that C;
updates happen before their first await. Neither success nor failure terminal
projection replaces C. A callback retained by the runner can therefore still
publish an active child update after runPhase resolved/rejected if C's activity
remains active. Preserve this boundary; do not introduce a closed flag or policy.

## Successful result publication

After runner result resolves, choose definition.artifactPath ??
`artifacts/${definition.phase}.md` (empty string is accepted). Await
ctx.store.writeArtifact(A.runId,path,result.response,{signal}). Use artifact.relativePath
in all later metadata, not its absolute path.

ctx.updatePhase(C,definition.phase,patch) gives terminal phase projection. Ordered
patch keys: activityId,artifactPath,completedAt=new timestamp,sessionId=result.sessionId,
status="completed",traceId=result.traceId??childTrace?.traceId,turnId=result.turnId.
Then ctx.upsertActivity(projected,activity), with ordered fields:
activityId,artifactPath,completedAt=new timestamp,inputArtifactPaths,
kind="agent_session",truthy result.model if any,nodeId=phaseNodeId(definition.phase),
outputArtifactPaths=[relativePath],parentSessionId=A.sessionId,phase=definition.phase,
sessionId=result.sessionId,startedAt=(first current C activity with invocation ID)?.startedAt
?? new timestamp, status="completed",traceId=result.traceId??childTrace?.traceId,
turnId=result.turnId. Result fields do not fall back to linked model/session/turn.
The extra startedAt clock runs only on nullish fallback at this evaluation position.

ctx.addArtifact(terminalWithActivity,artifactRecord) gives W. Record ordered keys:
contentType="text/markdown",createdAt=new timestamp,label=definition.title,
path=relativePath,phase=definition.phase. C is NOT changed to W.
Await writeSnapshot(W,{signal}), appendGraphStatus(W,definition.phase,"completed",signal),
appendEvent(W.runId,"artifact_written",{message:`Artifact written: ${relativePath}`,
phase,signal}), then appendEvent(W.runId,"phase_completed",{message:
`${definition.title} completed.`,phase,signal}). Return {response:result.response,snapshot:W}
in that order. Do not wrap the entire public native async lifetime in another
async helper, or add promises between these gates.

## Recovery, errors and cancellation

Catch runner/input/prompt/artifact/completion/publication failures. If the current
options.abortSignal?.aborted is truthy, rethrow the same error immediately; do not
project/persist failure. Otherwise derive errorMessage by Error.message or String(error).
Find first invocation activity in C. ctx.updatePhase(C,definition.phase,patch), keys:
activityId,completedAt=new timestamp,error=errorMessage,status="failed".
Then ctx.upsertActivity(failedPhase,activity), keys:
activityId,completedAt=new timestamp,error,inputArtifactPaths,kind="agent_session",
truthy currentActivity?.model if any,nodeId=phaseNodeId(definition.phase),outputArtifactPaths=[],
parentSessionId=A.sessionId,phase=definition.phase,truthy currentActivity?.sessionId
if any,startedAt=currentActivity?.startedAt??new timestamp,status="failed",
traceId=currentActivity?.traceId??childTrace?.traceId,truthy currentActivity?.turnId if any.
No artifact field; use C rather than a previously persisted completed snapshot.

Await writeSnapshot(failedWithActivity,{signal}), appendGraphStatus(failedWithActivity,
definition.phase,"failed",signal), appendEvent(failedWithActivity.runId,"phase_failed",
{message:errorMessage,phase:definition.phase,signal}). Then rethrow original error
identity. If any recovery effect or projection throws/rejects, that new error escapes
instead. No catch around recovery, rollback, retry or new cancellation guard.

## Compatibility scope

Context methods own immutable projections and may invoke their own clocks; treat
them as observable ports. Preserve their call ordering and argument references,
not merely serialized results. Data is schema-shaped records, synthetic fixtures;
there is no new policy for malformed getters, providers, filesystem or accounts.
Actual callers are continueRun's agent-phase branch and runFinalCriticLoop. Both
await runPhase; caller-level retry/pause/critic policy stays outside this owner.
This contract is read-derived; no pre-authoring runtime suite was executed under
the current speed-first cadence. A minimal paired emitted write-safety check is
reserved for the completed candidate, and broader checks will be marked unrun.
