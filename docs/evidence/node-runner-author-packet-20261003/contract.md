# Complete workflow node runner: functional/public author contract

Author the complete exported runtime interface and runWorkflowNode owner described by public-api.d.ts at `apps/cli/packages/core/src/workflow/scheduler/node-runner.ts`. Existing graph, prompt, tracing, event-log and scheduler types are collaborators to import, not reconstruct. No existing outcome implementation is supplied or required as a dependency: include the complete completion/failure projection in your authored owner, using private decomposition of your choice. Keep the owner below 400 readable lines; do not compress it to evade the limit. If an additional private implementation file is genuinely needed, freeze the complete set and disclose its boundary rather than importing another lane's helper.

Read only these four inputs and your own output. Do not read a repository, source/history/test/review, other author's output, network or other scratch directory. This shared executor restriction is instruction-based, not OS isolation. The source-exposed curator has already handled repository instructions and distilled published corrected behavior. Drafting does not require a novel algorithm or artificially different wrappers. Required fields/order, strings, reference identity, port gates and clock observations are compatibility constraints; storage and private expression remain your choices.

Write a complete output/node-runner.ts and output/author-record.json. Freeze and SHA-256-bind input/output bytes before any compiler/runtime/source comparison; record actual reads, UTC freeze, boundary breaches and unresolved questions. Exclude receipt self-hash from its contents and report it separately. Then stop, without tests, compilation, publication or production edits.

## Public promise and effect boundary

runWorkflowNode returns a native Promise of the public NodeRunOutcome with an own enumerable writable property `started`, holding a distinct native Promise of NodeRunStarted. Outcome own keys are nodeId, ok, snapshot in that order. The started result is a fresh object with sole key snapshot pointing to the accepted active snapshot. It has no timeout or rejection channel. Activation failure rejects the main promise with the exact value and leaves started pending indefinitely. Do not add rejection cleanup, thenable wrappers, delayed launch, a new global queue or a cancellation check at entry.

The execution starts immediately: initial synchronous setup begins before returning the main promise; its first asynchronous gate is initial snapshot persistence. The started property is attached before the function returns. Successful startup resolves started only after activation persistence, snapshot ownership change, active status journal and node_started event have all succeeded. Resolve started, then continue preparing/calling runner in the same resumed turn; do not insert an additional await after that resolution. Native microtask behavior is preserved.

Use supplied runtime/snapshotAccess objects dynamically at each effect. Do not bind callbacks to undefined, capture stale runtime ports or clone runtime/options. getSnapshot/setSnapshot receivers are snapshotAccess; createActivityId/writeSnapshot/writeArtifact receivers are runtime; runner.run receiver is the runtime.runner object; event-log method receiver is runtime.eventLog. Custom buildPrompt receiver is options. Normal imported helpers are invoked as existing functions. Signals and shared node/options/trace references are forwarded unchanged, with no new validation or cancellation policy.

Each snapshot persist is awaited before setSnapshot. Ignore the return value of setSnapshot and retain the same explicitly published snapshot reference for subsequent status/events/results. No additional persist occurs just because setSnapshot returns a different value. A write rejection prevents that set and later effects. Shared snapshots can be mutated by clocks/ports and the current owner can advance while awaits are outstanding; use the exact read/current-snapshot points below rather than freezing the invocation's entire state.

## Initial setup and activation

Read the initial snapshot once, then obtain activityId, then startedAt from eventLog.timestamp, then map initialSnapshot.artifacts to a fresh array of path strings in order. Retain that inputArtifactPaths array for the activity and later outcomes. Activity id and startedAt are invocation facts; other options/node fields remain live at their specified reads.

If options.traceContext is truthy, call existing createChildTraceContext with that current parent and a fresh options object: first attributes, then sessionId read from the current parent. Attribute own keys/order: workflowActivityId = activityId; workflowKind = initial kind; workflowNodeId = current node.id; workflowPhase = current options.phase; workflowRunId = initial runId. The returned trace context is reused for runner and fallback trace id. Do not reimplement trace generation. If absent, no tracing helper call occurs.

Update the initial graph node using current node.id and a patch with own keys error=undefined then status=active. Then construct the active activity in this order: activityId; inputArtifactPaths; kind=agent_session; nodeId=current node.id; outputArtifactPaths=fresh empty array; parentSessionId=options.parentSessionId (own even undefined); phase=options.phase; startedAt; status=active; traceId=child trace id (own even undefined). Only after activity construction obtain another timestamp and pass it to upsertActivity. The helper return is the active snapshot.

Publish in order: writeSnapshot(active,{signal: current options.abortSignal}); await; setSnapshot(active); appendGraphStatus(active,current node.id,current options.phase,active,current signal); await; emitEvent(active,node_started, fresh options); await; resolve started with that active reference. Event options own fields/order: message=`Node started: ${node.title}`; nodeId=node.id; phase=options.phase; signal=options.abortSignal. These fields are read when the publication is prepared, not cached before prior awaits. All activation/projection/publication work is outside recovery: any error escapes without failure projection/publication.

## Runner request and child linkage

After started resolves, prepare one request and call/await runtime.runner.run inside the terminal-recovery boundary. Request own fields and reads in order: abortSignal=current signal; activityId; cwd=options.cwd; node=same supplied node; onChildSessionStarted=new callback; onEvent=options.onEvent; parentSessionId=options.parentSessionId; phase=options.phase; prompt; runId=active snapshot.runId; task=active snapshot.task; traceContext=child context (own even undefined).

For prompt, if current options.buildPrompt is truthy invoke it synchronously with fresh own keys node, phase, snapshot (same supplied node, current phase, active snapshot). Otherwise invoke the existing default prompt helper with active snapshot, node and current phase. Prompt failure enters terminal failure recovery. Do not use a later snapshot for the runner's graph-independent runId/task/prompt. Other native awaits may advance the owner; the active snapshot reference itself remains the request source.

Each child callback invocation reads the then-current snapshot once and finds the first matching activityId. If absent or status not active, resolve without effects or clocks. Otherwise construct a fresh activity beginning with a spread of that current activity, then a model override only if event.model is truthy, then sessionId=event.sessionId, traceId=event.traceId nullish-fallback current traceId, turnId=event.turnId nullish-fallback current turnId. Obtain one timestamp after those observations, then upsertActivity(current,activity,timestamp).

Await writeSnapshot(child snapshot,{signal: current signal}); setSnapshot(child snapshot); await emitEvent(child snapshot,workflow_session_linked, fresh options). Event option fields/order: message=`Workflow session linked: ${event.sessionId}`; nodeId=current node.id; payload=existing compactWorkflowPayload on a fresh ordered object activityId, model, sessionId, traceId, turnId; phase=current phase; signal=current signal. Event fields are read after persistence/set. Do not retain an initial child snapshot across callback invocations, do not alter inactive/terminal activities and do not add rollback. Callback exceptions reject that callback; runner determines whether they reject its run.

## Artifact call and completion projection

After runner success, await writeArtifact with four arguments: outer runId from active snapshot; relative path `${options.artifactDirectory ?? "artifacts/exec"}/${safeArtifactName(node.id)}.md`; result.response; fresh {signal: current signal}. Outer runId is read before path/helper evaluation. Empty artifactDirectory remains empty (nullish fallback only); do not add run/activity identifiers or change sanitization. Call the existing safeArtifactName helper, not a reconstruction.

Only after the artifact await succeeds, read the then-current snapshot once. Completion graph patch uses current node.id and own keys attempts=current node.attempts (including own undefined), error=undefined, status=completed. Build the completed activity with exact field/clock ordering:

| Order | Value |
| --- | --- |
| activityId | initial invocation id |
| artifactPath | artifact.relativePath |
| completedAt | next eventLog.timestamp() |
| inputArtifactPaths | retained original array |
| kind | agent_session |
| nodeId | current node.id |
| outputArtifactPaths | fresh one-element array of current artifact.relativePath |
| parentSessionId | current options.parentSessionId, own even undefined |
| phase | current options.phase |
| model | override own field only if result.model is truthy |
| sessionId | result.sessionId |
| startedAt | invocation startedAt |
| status | completed |
| traceId | result.traceId nullish-fallback child trace id, own even undefined |
| turnId | result.turnId, own even undefined |

After building that activity, obtain another timestamp and upsert it into the graph-updated snapshot. Then build the artifact record in order: contentType=text/markdown; createdAt=next timestamp; label=current node.title; path=current artifact.relativePath; phase=current options.phase (own even undefined). Then obtain another timestamp and addArtifact. This is four completion clocks, with intervening field reads/helper stages as specified. Do not hoist clocks or read all metadata before the first clock. The completed snapshot is that final helper return; retain the original artifact object for later completion event path observation.

Existing helper behaviors, including immutable top-level graph updates, activity/session-link derivation and artifact replacement-by-path, remain their responsibility. Invoke them rather than reimplementing or adopting another lane's helper. Completion projection errors are inside recovery.

## Failure projection: captured facts and live metadata

Any runner/request/prompt, artifact or completion-projection error enters failure recovery. A success-publication error may also enter it once as described below. At entry first inspect current options.abortSignal?.aborted. If true, reject the identical encountered error; do not replace it with signal.reason and do not project/persist failure.

Otherwise capture attempts=(current supplied node.attempts nullish-fallback 0)+1, then errorMessage=(error instanceof Error ? error.message : String(error)), then status=failed when attempts>=maxAttempts, otherwise pending. Do not read attempts from the graph's current node; do not mutate/increment the supplied node or add a validation rule for maxAttempts. These attempts/error/status primitive facts remain the terminal publication facts even if subsequent clocks/ports mutate node or projected snapshot.

Read the current snapshot once, locate the first matching activity as linked metadata, and apply updateGraphNode(current,current node.id, patch with own ordered keys attempts,error=errorMessage,status). Construct the failed activity in this order: activityId; completedAt=next timestamp; error=errorMessage; inputArtifactPaths=retained array; kind=agent_session; model only if linked?.model truthy; nodeId=current node.id; outputArtifactPaths=fresh empty array; parentSessionId=current option (own undefined preserved); phase=current option; sessionId only if linked?.sessionId truthy; startedAt; status=captured status; traceId=linked?.traceId nullish-fallback child trace id (own undefined preserved); turnId only if linked?.turnId truthy. After construction obtain another timestamp and upsertActivity. Two failure clocks occur. Do not clone/freeze the linked activity before the clock; its later metadata observations remain live.

Failure projection/conversion/clock errors escape; do not attempt a second failure projection. They must not enter a catch that repeats recovery.

## Terminal publication, error asymmetry and accepted outcomes

For either selected terminal snapshot, await writeSnapshot(snapshot,{signal: current signal}), setSnapshot(snapshot), then await appendGraphStatus(snapshot,current node.id,current phase,captured terminal status,current signal).

For success, then await artifact_written event followed by node_completed event. Both options have own fields in order message,nodeId,phase,signal, read when each publication is prepared. Messages: `Artifact written: ${artifact.relativePath}` then `Node completed: ${node.title}`. Use the original returned artifact reference for the first path; changes by preceding ports remain observable. For failure, publish one node_failed event with ordered options message=captured errorMessage; nodeId=current node.id; payload=fresh ordered object attempts=captured number,retry=(captured status is pending); phase=current phase; signal=current signal. Never derive those failure payload facts from a port-mutated failure snapshot.

After accepted terminal publication return a fresh outcome with current node.id, ok=true for success or false for failure, and the same terminal snapshot reference. There is no final abort inspection. If the accepted final event queues or causes abort, a direct node outcome still resolves; its caller may observe cancellation later.

A success persistence/set/status/event exception enters failure recovery once, observing the current owner and current signal. Prior successful publication remains visible and is not rolled back. Failure persistence/set/status/event exception rejects with its exact value and causes no retry/further failure event. Neither accepted success nor accepted failure enters another runner attempt inside this owner. No additional awaited orchestration/projection helper, promise queue or cross-call lock is prescribed; preserve the native await gates and synchronous projection stages.

## Scope and compatibility limits

Ordinary schema-shaped mutable objects and clocks/ports are in scope, including option phase and snapshot changes across awaits. No new support for malformed types, arbitrary proxies or monkeypatched global APIs is requested. Do not pre-copy node/options, move live phase observations before awaits, normalize truthy/nullish field rules or omit specified own undefined keys. No global licence labels, cleanup policy, notices, permissions or scheduler/expert-loop changes belong to this owner.
