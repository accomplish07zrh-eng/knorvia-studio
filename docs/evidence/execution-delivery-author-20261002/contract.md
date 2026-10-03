# Scheduled phase bridge and failure projection — functional/API-only packet

Write scheduled-phase.ts and failures.ts, exports in api.json. Read only contract
and api.json; save/hash before review. No old implementation/history/tests/oracles,
other packets, services or extra agents. Scheduler is an UNCHANGED dependency owned
by another lane: import WorkflowGraphScheduler from ../scheduler.js, never edit it.

## Scheduled phase

Native async runScheduledPhase(ctx,snapshot,definition,options). No local catch or
abort admission. ctx.updatePhase(snapshot,definition.phase,{error:undefined,
startedAt:ctx.timestamp(),status:"active"}); await writeSnapshot(active,{signal});
await appendEvent(active.runId,"phase_started",{message:`${definition.title} started.`,phase,signal}).

Construct scheduler after those gates with ordered ports appendEvent (arrow forwards
to ctx.store.appendEvent at call time), appendGraphRecord (same), createActivityId:
ctx.createActivityId,now:ctx.now,onWorkflowEvent:ctx.onWorkflowEvent,plannerRunner,
runner,writeArtifact arrow,writeSnapshot arrow. PlannerRunner.run native async forwards
to ctx.agentRunner.run using ordered fields abortSignal=input.abortSignal,activityId,
cwd,onChildSessionStarted,onEvent,parentSessionId,phase,prompt,runId,task,traceContext,
workflowKind=ctx.definition.kind. Await it; parseWorkflowPlannerResult(result.response,
definition.phase); return {...plannerResult,model:result.model,response,sessionId,
traceId,turnId}. No cached result fields before parser call. Ordinary runner.run is
native async arrow returning ctx.agentRunner.run with same ordered forwarded fields
but no local await/parser. Keep that different settlement boundary. Call-time ctx
and store/runner receivers are preserved. Artifact/snapshot forwarding ports retain
arguments and references; no clone/rebind of context funcs.

Await scheduler.run ordered input abortSignal,artifactDirectory=`artifacts/${safeArtifactName(definition.phase)}`,
buildPrompt=({node,snapshot:promptSnapshot})=>buildScheduledNodePrompt(promptSnapshot,definition,node),
cwd,executableNodeIds=executableNodeIdsForPhase(active.graph,definition.phase),onEvent,
parentSessionId=active.sessionId,phase,snapshot=active,traceContext. Other options fields
from options. If result.status !== completed, throw Error(`Workflow ${definition.phase} scheduler paused: ${result.reason}`).

summary=buildScheduledPhaseSummary(result.snapshot,definition.phase); await writeArtifact
(result.snapshot.runId,definition.artifactPath??`artifacts/${definition.phase}.md`,summary,{signal}).
Then last result.snapshot.activities matching phase AND status completed (filter entire
array then at(-1)); none allowed. ctx.updatePhase(result.snapshot,phase, ordered patch
activityId=activity?.activityId,artifactPath=artifact.relativePath,completedAt=timestamp(),
sessionId=activity?.sessionId,status:"completed",traceId=activity?.traceId,turnId=activity?.turnId.
ctx.addArtifact(completed,{contentType:"text/markdown",createdAt:timestamp(),label:definition.title,
path:artifact.relativePath,phase}). Keep live artifact.relativePath reads, not one
captured value; clock/port can mutate plain returned artifact. Await snapshot write,
graph completed, artifact_written event message `Artifact written: ${artifact.relativePath}`,
then phase_completed message `${definition.title} completed.`. Both options ordered
message,phase,signal. Return exact withArtifact ref. All signals read at each call.

Dependencies: helpers ./ids.js; parser ./parsers/planner-result.js; prompts ./prompts.js;
context type ./runtime-context.js; options ./types.js; contract types as in API.

## failures.ts

latestWorkflowActivity: last occurrence (reverse traversal of COPY) whose status
failed OR active OR phase===snapshot.currentPhase; original ref or undefined; no mutation.
workflowFailureFromError computes kind first, code second, then returns ordered
truthy conditional activityId,truthy conditional code,kind,message,truthy nodeId,
truthy phase,recoverable=(kind!==cancelled),retryable=retryability(kind,error),truthy
sessionId,truthy traceId,truthy turnId. Field presence/order and supplied message fixed.

Error-chain traversal occurs independently for each classifier/code/retry query;
never reuse one cached chain. Chain starts given error, max8 occurrences; stops before
null/undefined; push current BEFORE duplicate check; if typeof!==object stop (functions
also stop); if object seen already stop after that repeated occurrence; else mark in
WeakSet and follow .cause. Arrays count as objects. Error accessor failures propagate.
Record conversion accepts any truthy typeof object, including arrays/Date/Error;
otherwise {}. Raw string conversion accepts strings unchanged, otherwise "".

Kind query loops chain entries. First isCoreError(entry): enum ModelContextExceeded
->model_context, ModelRateLimited->rate_limit, ModelTimeout->timeout,
PermissionDenied/PermissionTimeout->permission, ToolExecutionFailed/ToolTimeout/ToolMaxCalls
->tool, ConfigurationError->configuration, TurnCancelled->cancelled. Other enum falls
through same entry's loose classification. Then read raw record.code lowercased,
record.type lowercased, record.reason nullishly fallback to record.context-as-record.reason
lowercased. Combined `${code} ${type} ${reason}` includes checks ordered rate->rate_limit,
timeout->timeout,context->model_context,auth OR not_configured->auth,permission->permission,
tool->tool,network OR proxy OR tls->network,provider OR model_request_failed->provider.
First match across entries wins; default unknown. Do not trim strings or add codes.
Code query loops independent chain: raw string(record.code || record.type), first
truthy string returned, else undefined; truthy nonstring code blocks type fallback.
Retry query: auth/cancelled/configuration immediately false (no chain traversal).
Otherwise fresh chain: first entry record.retryable boolean wins; else context.retryable
boolean wins; default true. Preserve direct-before-context order.

workflowRecoveryActions makes scoped object of truthy activityId,nodeId,phase from
failure in that order. Returns three ordered objects: {action:"retry",label:"Retry",...scoped},
{action:"retry_with_current_model",label:"Retry with current model",...scoped},
{action:"cancel",destructive:true,label:"Cancel workflow",...scoped}. No new actions/policy.
Import enum/isCoreError and types from @knorvia/contracts. Source-exposed curator,
body-free author packet, no absolute clean-room/rights claim or algorithm novelty.
